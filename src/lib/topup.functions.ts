import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCPF, onlyDigits } from "./drivers";
import { MAX_TOPUP_CENTS, MIN_TOPUP_CENTS } from "./topup";
import type { PaymentBrickData } from "./mercadopago.functions";

/** Cria uma order do Mercado Pago (cartão ou Pix) para recarregar o saldo GoPet. */
export const createTopupPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amountCents: number; cpf: string; brickData: PaymentBrickData }) => {
    if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_TOPUP_CENTS || input.amountCents > MAX_TOPUP_CENTS) {
      throw new Error("Escolha um valor entre R$ 10,00 e R$ 2.000,00.");
    }
    if (!isValidCPF(input.cpf)) throw new Error("CPF inválido. Confira os números digitados.");
    if (!input.brickData?.payment_method_id) throw new Error("Escolha uma forma de pagamento.");
    return { amountCents: input.amountCents, cpf: onlyDigits(input.cpf), brickData: input.brickData };
  })
  .handler(async ({ data, context }) => {
    const { data: authData } = await context.supabase.auth.getUser();
    const email = data.brickData.payer?.email ?? authData.user?.email;
    if (!email) return { error: "Não foi possível identificar o e-mail do pagador." };
    const method = data.brickData.payment_method_id ?? "";
    const isPix = method === "pix";
    if (!isPix && !data.brickData.token) return { error: "Os dados do cartão não foram concluídos." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const idempotencyKey = crypto.randomUUID();
    const { data: attempt, error: insertError } = await supabaseAdmin.from("mercadopago_topups")
      .insert({ user_id: context.userId, payment_method: method, amount_cents: data.amountCents, idempotency_key: idempotencyKey })
      .select("id").single();
    if (insertError || !attempt) return { error: "Não foi possível iniciar a recarga. Tente novamente." };

    try {
      const { mercadoPagoRequest, normalizeOrderStatus, orderPayment, orderPixData } = await import("./mercadopago.server");
      const expiresAt = isPix ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : undefined;
      const amount = (data.amountCents / 100).toFixed(2);
      const paymentData: Record<string, unknown> = isPix
        ? { amount, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: "PT30M" }
        : { amount, payment_method: { id: method, type: data.brickData.payment_type_id ?? "credit_card", token: data.brickData.token, installments: Number(data.brickData.installments ?? 1) } };
      const order = await mercadoPagoRequest<import("./mercadopago.server").MercadoPagoOrder>("/v1/orders", {
        method: "POST",
        idempotencyKey,
        body: JSON.stringify({
          type: "online", processing_mode: "automatic", external_reference: `topup:${attempt.id}`,
          total_amount: amount, payer: { email, identification: { type: "CPF", number: data.cpf } },
          transactions: { payments: [paymentData] },
        }),
      });
      const payment = orderPayment(order);
      const status = normalizeOrderStatus(order.status, order.status_detail ?? payment?.status_detail, payment?.expiration_time ?? expiresAt);
      const qr = orderPixData(order);
      await supabaseAdmin.from("mercadopago_topups").update({
        mp_order_id: order.id, qr_code: qr.qrCode, qr_code_base64: qr.qrCodeBase64, expires_at: expiresAt ?? null,
      }).eq("id", attempt.id);
      await supabaseAdmin.rpc("apply_mercadopago_topup", { _topup_id: attempt.id, _status: status, _status_detail: order.status_detail ?? payment?.status_detail ?? "" });
      return { topupId: attempt.id, status, qrCode: qr.qrCode };
    } catch (error) {
      await supabaseAdmin.from("mercadopago_topups").update({ status: "rejected", status_detail: "provider_error" }).eq("id", attempt.id);
      return { error: error instanceof Error ? error.message : "Falha de rede. Tente novamente." };
    }
  });

/** Consulta a order da recarga no Mercado Pago (reforço caso o aviso automático demore). */
export const syncTopupPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { topupId: string }) => {
    if (!/^[0-9a-fA-F-]{36}$/.test(input.topupId)) throw new Error("Recarga inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("mercadopago_topups")
      .select("mp_order_id, status").eq("id", data.topupId).eq("user_id", context.userId).maybeSingle();
    if (!row?.mp_order_id) return { status: "unknown", paid: false };
    if (row.status === "approved") return { status: "approved", paid: true };
    try {
      const { settleMercadoPagoOrder } = await import("./mercadopago-settle.server");
      const result = await settleMercadoPagoOrder(row.mp_order_id);
      return { status: result?.status ?? "unknown", paid: Boolean(result?.paid) };
    } catch (error) {
      console.error("Topup sync failed", error);
      return { status: "unknown", paid: false };
    }
  });
