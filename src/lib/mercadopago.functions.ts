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
    if (!method) return { error: "Escolha uma forma de pagamento." };
    const { data: attempt, error: insertError } = await supabaseAdmin
      .from("mercadopago_payments")
      .insert({ ride_id: ride.id, tutor_id: context.userId, payment_method: method, status: "pending", amount_cents: ride.price_cents, idempotency_key: idempotencyKey })
      .select("id")
      .single();
    if (insertError || !attempt) return { error: "Não foi possível iniciar o pagamento. Tente novamente." };

    try {
      const { mercadoPagoRequest, normalizeOrderStatus, orderPayment, orderPixData } = await import("./mercadopago.server");
      const isPix = method === "pix";
      const expiresAt = isPix ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : undefined;
      const orderPaymentData: Record<string, unknown> = {
        amount: (ride.price_cents / 100).toFixed(2),
        payment_method: isPix
          ? { id: "pix", type: "bank_transfer" }
          : {
              id: method,
              type: data.brickData.payment_type_id ?? "credit_card",
              token: data.brickData.token,
              installments: Number(data.brickData.installments ?? 1),
            },
      };
      if (!isPix) {
        if (!data.brickData.token) return { error: "Os dados do cartão não foram concluídos." };
      } else orderPaymentData["expiration_time"] = "PT30M";
      const payload: Record<string, unknown> = {
        type: "online",
        processing_mode: "automatic",
        external_reference: ride.id,
        total_amount: (ride.price_cents / 100).toFixed(2),
        payer: { email, identification: { type: "CPF", number: data.cpf } },
        transactions: { payments: [orderPaymentData] },
      };
      const order = await mercadoPagoRequest<import("./mercadopago.server").MercadoPagoOrder>("/v1/orders", {
        method: "POST",
        body: JSON.stringify(payload),
        idempotencyKey,
      });
      const payment = orderPayment(order);
      const status = normalizeOrderStatus(order.status, order.status_detail ?? payment?.status_detail, payment?.expiration_time ?? expiresAt);
      const qr = orderPixData(order);
      await supabaseAdmin.from("mercadopago_payments").update({
        mp_order_id: order.id, payment_method: payment?.payment_method?.id ?? payment?.payment_method_id ?? method,
        status, status_detail: order.status_detail ?? payment?.status_detail ?? null, qr_code: qr.qrCode,
        qr_code_base64: qr.qrCodeBase64, expires_at: expiresAt ?? null,
      }).eq("id", attempt.id);
      return { paymentId: order.id, status, statusDetail: order.status_detail ?? payment?.status_detail ?? null,
        qrCode: qr.qrCode, qrCodeBase64: qr.qrCodeBase64,
        expiresAt: expiresAt ?? null };
    } catch (error) {
      await supabaseAdmin.from("mercadopago_payments").update({ status: "rejected", status_detail: "provider_error" }).eq("id", attempt.id);
      return { error: error instanceof Error ? error.message : "Falha de rede. Tente novamente." };
    }
  });
