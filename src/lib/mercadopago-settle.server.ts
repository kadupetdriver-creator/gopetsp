import { mercadoPagoRequest, normalizeOrderStatus, orderAmountCents, orderPayment, orderPixData, type MercadoPagoOrder } from "./mercadopago.server";

/**
 * Consulta a order na API do Mercado Pago e aplica o resultado no banco de forma
 * idempotente. Usado pelo webhook e pela verificação periódica da tela de pagamento.
 */
export async function settleMercadoPagoOrder(orderId: string): Promise<{ status: string; paid: boolean } | null> {
  const order = await mercadoPagoRequest<MercadoPagoOrder>(`/v1/orders/${encodeURIComponent(orderId)}`);
  const rideId = order.external_reference;
  const amountCents = orderAmountCents(order);
  if (!rideId || amountCents <= 0) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("mercadopago_payments")
    .select("id, ride_id, amount_cents, status, coupon_id")
    .eq("mp_order_id", order.id)
    .maybeSingle();
  if (!row || row.ride_id !== rideId || row.amount_cents !== amountCents) return null;

  const payment = orderPayment(order);
  const status = normalizeOrderStatus(order.status, order.status_detail ?? payment?.status_detail, payment?.expiration_time);
  const qr = orderPixData(order);

  if (row.status !== status) {
    await supabaseAdmin
      .from("mercadopago_payments")
      .update({
        status,
        status_detail: order.status_detail ?? payment?.status_detail ?? null,
        ...(qr.qrCode ? { qr_code: qr.qrCode, qr_code_base64: qr.qrCodeBase64 } : {}),
      })
      .eq("id", row.id);
  }

  if (status === "approved") {
    await supabaseAdmin
      .from("rides")
      .update({ paid_at: new Date().toISOString() })
      .eq("id", row.ride_id)
      .is("paid_at", null);
    if (row.coupon_id) {
      await supabaseAdmin
        .from("referral_coupons")
        .update({ status: "used", used_ride_id: row.ride_id, used_at: new Date().toISOString() })
        .eq("id", row.coupon_id)
        .eq("status", "available");
    }
  }
  if (["refunded", "cancelled", "expired", "rejected"].includes(status)) {
    await supabaseAdmin.from("rides").update({ paid_at: null }).eq("id", row.ride_id);
  }

  return { status, paid: status === "approved" };
}
