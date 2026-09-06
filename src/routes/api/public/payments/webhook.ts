import { createFileRoute } from "@tanstack/react-router";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";

/**
 * Endpoint oficial registrado pela Lovable para eventos do Stripe.
 * Recebe sandbox e live pelo parâmetro ?env=.
 */
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const environment: StripeEnv = rawEnv;
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

        const markPaid = async (rideId: string, paymentIntent: string | null) => {
          await supabaseAdmin
            .from("ride_payments")
            .update({
              status: "held",
              paid_at: new Date().toISOString(),
              stripe_payment_intent: paymentIntent,
            })
            .eq("ride_id", rideId)
            .eq("status", "pending");
        };

        switch (event.type) {
          case "checkout.session.completed":
          case "checkout.session.async_payment_succeeded": {
            const session = event.data.object;
            if (session.metadata?.["kind"] === "credit_topup" && session.payment_status === "paid") {
              await supabaseAdmin
                .from("credit_transactions")
                .update({
                  status: "completed",
                  completed_at: new Date().toISOString(),
                  stripe_payment_intent:
                    typeof session.payment_intent === "string" ? session.payment_intent : null,
                })
                .eq("stripe_session_id", session.id)
                .eq("status", "pending");
              break;
            }
            const rideId = session.metadata?.["rideId"];
            if (rideId && session.payment_status !== "unpaid") {
              await markPaid(
                rideId,
                typeof session.payment_intent === "string" ? session.payment_intent : null,
              );
            }
            break;
          }
          case "checkout.session.async_payment_failed": {
            const session = event.data.object;
            if (session.metadata?.["kind"] === "credit_topup") {
              await supabaseAdmin
                .from("credit_transactions")
                .update({ status: "failed" })
                .eq("stripe_session_id", session.id)
                .eq("status", "pending");
              break;
            }
            const rideId = session.metadata?.["rideId"];
            if (rideId) {
              await supabaseAdmin
                .from("ride_payments")
                .update({ status: "failed" })
                .eq("ride_id", rideId)
                .eq("status", "pending");
            }
            break;
          }
          case "checkout.session.expired": {
            const session = event.data.object;
            if (session.metadata?.["kind"] === "credit_topup") {
              await supabaseAdmin
                .from("credit_transactions")
                .update({ status: "cancelled" })
                .eq("stripe_session_id", session.id)
                .eq("status", "pending");
              break;
            }
            const rideId = session.metadata?.["rideId"];
            if (rideId) {
              await supabaseAdmin
                .from("ride_payments")
                .update({ status: "cancelled" })
                .eq("ride_id", rideId)
                .eq("status", "pending");
            }
            break;
          }
          case "payment_intent.payment_failed": {
            const intent = event.data.object;
            await supabaseAdmin
              .from("ride_payments")
              .update({ status: "failed" })
              .eq("stripe_payment_intent", intent.id)
              .eq("status", "pending");
            break;
          }
          case "charge.refunded": {
            const charge = event.data.object;
            const intentId =
              typeof charge.payment_intent === "string" ? charge.payment_intent : null;
            if (intentId) {
              await supabaseAdmin
                .from("ride_payments")
                .update({ status: "refunded", refunded_at: new Date().toISOString() })
                .eq("stripe_payment_intent", intentId);
            }
            break;
          }
          case "account.updated": {
            const account = event.data.object;
            await supabaseAdmin
              .from("profiles")
              .update({
                payouts_enabled: Boolean(account.payouts_enabled),
                payouts_checked_at: new Date().toISOString(),
              })
              .eq("stripe_account_id", account.id);
            break;
          }
          default:
            break;
        }

        return Response.json({ received: true });
      },
    },
  },
});
