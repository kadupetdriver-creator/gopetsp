import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const webhookSchema = z.object({
  data: z.object({ id: z.string().max(100) }).optional(),
  type: z.string().max(50).optional(),
}).passthrough();

async function processOrder(orderId: string) {
  try {
    const { mercadoPagoRequest, normalizeOrderStatus, orderAmountCents, orderPayment } = await import("@/lib/mercadopago.server");
    const order = await mercadoPagoRequest<import("@/lib/mercadopago.server").MercadoPagoOrder>(`/v1/orders/${encodeURIComponent(orderId)}`);
    const rideId = order.external_reference;
    if (!rideId || orderAmountCents(order) <= 0) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("mercadopago_payments")
      .select("id, ride_id, amount_cents, status")
      .eq("mp_order_id", order.id).maybeSingle();
    if (!row || row.ride_id !== rideId || row.amount_cents !== orderAmountCents(order)) return;
    const payment = orderPayment(order);
    const status = normalizeOrderStatus(order.status, order.status_detail ?? payment?.status_detail, payment?.expiration_time);
    if (row.status !== status) {
      await supabaseAdmin.from("mercadopago_payments").update({
        status,
        status_detail: order.status_detail ?? payment?.status_detail ?? null,
        expires_at: payment?.expiration_time ?? null,
      }).eq("id", row.id);
    }
    if (status === "approved") {
      await supabaseAdmin.from("rides").update({ paid_at: new Date().toISOString() }).eq("id", row.ride_id).is("paid_at", null);
    }
    if (["refunded", "cancelled", "expired", "rejected"].includes(status)) {
      await supabaseAdmin.from("rides").update({ paid_at: null }).eq("id", row.ride_id);
    }
  } catch (error) {
    console.error("Mercado Pago order webhook processing failed", error);
  }
}

export const Route = createFileRoute("/api/public/mp-webhook")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env["MP_WEBHOOK_SECRET"];
    if (!secret) return new Response("Webhook not configured", { status: 503 });
    const url = new URL(request.url);
    let body: z.infer<typeof webhookSchema>;
    try { body = webhookSchema.parse(await request.json()); } catch { return new Response("Invalid body", { status: 400 }); }
    const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? "");
    const signature = request.headers.get("x-signature") ?? "";
    const requestId = request.headers.get("x-request-id") ?? "";
    const { verifyMercadoPagoSignature } = await import("@/lib/mercadopago.server");
    if (!dataId || !verifyMercadoPagoSignature({ signature, requestId, dataId, secret })) return new Response("Invalid signature", { status: 401 });
    if ((body.type ?? url.searchParams.get("type")) !== "order") return new Response("ok");
    void processOrder(dataId);
    return new Response("ok");
  } } },
});
