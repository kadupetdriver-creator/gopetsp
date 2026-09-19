import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const webhookSchema = z.object({
  data: z.object({ id: z.union([z.string().max(100), z.number()]) }).optional(),
  type: z.string().max(50).optional(),
}).passthrough();

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
    const { verifyMercadoPagoSignature, mercadoPagoRequest, normalizePaymentStatus } = await import("@/lib/mercadopago.server");
    if (!dataId || !verifyMercadoPagoSignature({ signature, requestId, dataId, secret })) return new Response("Invalid signature", { status: 401 });
    if (body.type && body.type !== "payment") return new Response("ok");
    try {
      const payment = await mercadoPagoRequest<import("@/lib/mercadopago.server").MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(dataId)}`);
      const rideId = payment.external_reference;
      if (!rideId || payment.transaction_amount <= 0) return new Response("ok");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin.from("mercadopago_payments").select("id, ride_id, amount_cents, status").eq("mp_payment_id", String(payment.id)).maybeSingle();
      if (!row || row.ride_id !== rideId || row.amount_cents !== Math.round(payment.transaction_amount * 100)) return new Response("ok");
      const status = normalizePaymentStatus(payment.status, payment.date_of_expiration);
      if (row.status !== status) {
        await supabaseAdmin.from("mercadopago_payments").update({ status, status_detail: payment.status_detail ?? null, expires_at: payment.date_of_expiration ?? null }).eq("id", row.id);
      }
      if (status === "approved") await supabaseAdmin.from("rides").update({ paid_at: new Date().toISOString() }).eq("id", row.ride_id).is("paid_at", null);
      if (status === "refunded") await supabaseAdmin.from("rides").update({ paid_at: null }).eq("id", row.ride_id);
      return new Response("ok");
    } catch (error) {
      console.error("Mercado Pago webhook failed", error);
      return new Response("Temporary failure", { status: 500 });
    }
  } } },
});
