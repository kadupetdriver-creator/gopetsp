import { createFileRoute } from "@tanstack/react-router";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const envParam = url.searchParams.get("env");
        const environment: StripeEnv = envParam === "live" ? "live" : "sandbox";
        const secret =
          environment === "live"
            ? process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"]
            : process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook not configured", { status: 500 });

        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("Missing signature", { status: 401 });
        const body = await request.text();

        const stripe = createStripeClient(environment);
        let event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, signature, secret);
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          const rideId = session.metadata?.["rideId"];
          if (rideId && session.payment_status === "paid") {
            await supabaseAdmin
              .from("ride_payments")
              .update({
                status: "held",
                paid_at: new Date().toISOString(),
                stripe_payment_intent:
                  typeof session.payment_intent === "string" ? session.payment_intent : null,
              })
              .eq("ride_id", rideId)
              .eq("status", "pending");
          }
        }

        if (event.type === "charge.refunded") {
          const charge = event.data.object;
          const intentId =
            typeof charge.payment_intent === "string" ? charge.payment_intent : null;
          if (intentId) {
            await supabaseAdmin
              .from("ride_payments")
              .update({ status: "refunded", refunded_at: new Date().toISOString() })
              .eq("stripe_payment_intent", intentId);
          }
        }

        return new Response("ok");
      },
    },
  },
});
