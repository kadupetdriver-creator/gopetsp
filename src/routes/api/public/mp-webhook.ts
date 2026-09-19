import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const webhookSchema = z.object({
  data: z.object({ id: z.string().max(100) }).optional(),
  type: z.string().max(50).optional(),
}).passthrough();

async function processOrder(orderId: string) {
  try {
    const { settleMercadoPagoOrder } = await import("@/lib/mercadopago-settle.server");
    const result = await settleMercadoPagoOrder(orderId);
    console.info("Mercado Pago webhook processed order", orderId, result?.status ?? "ignored");
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
