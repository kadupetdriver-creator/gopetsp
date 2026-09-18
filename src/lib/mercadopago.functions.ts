import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCPF, onlyDigits } from "./drivers";

export type PaymentBrickData = {
  token?: string;
  issuer_id?: string | number;
  payment_method_id?: string;
  payment_type_id?: string;
  installments?: number;
  payer?: { email?: string };
};

export const getMercadoPagoPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const publicKey = process.env["MP_PUBLIC_KEY"];
  if (!publicKey) return { error: "Mercado Pago ainda não foi configurado." };
  return { publicKey };
});

export const createMercadoPagoPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rideId: string; cpf: string; brickData: PaymentBrickData }) => {
    if (!/^[0-9a-fA-F-]{36}$/.test(input.rideId)) throw new Error("Corrida inválida.");
    if (!isValidCPF(input.cpf)) throw new Error("CPF inválido. Confira os números digitados.");
    if (!input.brickData?.payment_method_id) throw new Error("Escolha uma forma de pagamento.");
    return { rideId: input.rideId, cpf: onlyDigits(input.cpf), brickData: input.brickData };
  })
  .handler(async ({ data, context }) => {
    const { data: ride } = await context.supabase
      .from("rides")
      .select("id, tutor_id, price_cents, pet_name, status, paid_at")
      .eq("id", data.rideId)
      .maybeSingle();
    if (!ride || ride.tutor_id !== context.userId) return { error: "Corrida não encontrada." };
    if (ride.paid_at) return { error: "Esta corrida já foi paga." };
    if (ride.status === "cancelled" || ride.status === "completed") return { error: "Esta corrida não está disponível para pagamento." };

    const { data: authData } = await context.supabase.auth.getUser();
    const email = data.brickData.payer?.email ?? authData.user?.email;
    if (!email) return { error: "Não foi possível identificar o e-mail do pagador." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const idempotencyKey = crypto.randomUUID();
    const method = data.brickData.payment_method_id;
    const { data: attempt, error: insertError } = await supabaseAdmin
      .from("mercadopago_payments")
      .insert({ ride_id: ride.id, tutor_id: context.userId, payment_method: method, status: "pending", amount_cents: ride.price_cents, idempotency_key: idempotencyKey })
      .select("id")
      .single();
    if (insertError || !attempt) return { error: "Não foi possível iniciar o pagamento. Tente novamente." };

    try {
      const { mercadoPagoRequest, normalizePaymentStatus } = await import("./mercadopago.server");
      const isPix = method === "pix";
      const expiresAt = isPix ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : undefined;
      const payload: Record<string, unknown> = {
        transaction_amount: ride.price_cents / 100,
        description: `Corrida GoPet - ${ride.pet_name}`.slice(0, 255),
        payment_method_id: method,
        payer: { email, identification: { type: "CPF", number: data.cpf } },
        external_reference: ride.id,
        notification_url: "https://gopetsp.lovable.app/api/public/mp-webhook",
        metadata: { ride_id: ride.id, payment_attempt_id: attempt.id },
      };
      if (expiresAt) payload.date_of_expiration = expiresAt;
      if (!isPix) {
        payload.token = data.brickData.token;
        payload.installments = Number(data.brickData.installments ?? 1);
        if (data.brickData.issuer_id) payload.issuer_id = String(data.brickData.issuer_id);
      }
      const payment = await mercadoPagoRequest<import("./mercadopago.server").MercadoPagoPayment>("/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
        idempotencyKey,
      });
      const status = normalizePaymentStatus(payment.status, payment.date_of_expiration);
      const qr = payment.point_of_interaction?.transaction_data;
      await supabaseAdmin.from("mercadopago_payments").update({
        mp_payment_id: String(payment.id), payment_method: payment.payment_method_id ?? method,
        status, status_detail: payment.status_detail ?? null, qr_code: qr?.qr_code ?? null,
        qr_code_base64: qr?.qr_code_base64 ?? null, expires_at: payment.date_of_expiration ?? expiresAt ?? null,
      }).eq("id", attempt.id);
      return { paymentId: String(payment.id), status, statusDetail: payment.status_detail ?? null,
        qrCode: qr?.qr_code ?? null, qrCodeBase64: qr?.qr_code_base64 ?? null,
        expiresAt: payment.date_of_expiration ?? expiresAt ?? null };
    } catch (error) {
      await supabaseAdmin.from("mercadopago_payments").update({ status: "rejected", status_detail: "provider_error" }).eq("id", attempt.id);
      return { error: error instanceof Error ? error.message : "Falha de rede. Tente novamente." };
    }
  });
