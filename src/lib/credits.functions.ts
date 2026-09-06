import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

export const MIN_TOPUP_CENTS = 2000;
export const MAX_TOPUP_CENTS = 500000;

type TopupMethod = "card" | "pix";

function validEnv(env: unknown): StripeEnv {
  if (env === "sandbox" || env === "live") return env;
  throw new Error("Ambiente de pagamento inválido");
}

/** Cria o checkout de recarga de créditos (cartão ou Pix). */
export const createCreditTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { amountCents: number; method: TopupMethod; returnUrl: string; environment: StripeEnv }) => {
      if (!Number.isInteger(data.amountCents)) throw new Error("Valor inválido");
      if (data.amountCents < MIN_TOPUP_CENTS || data.amountCents > MAX_TOPUP_CENTS)
        throw new Error("Valor fora do limite permitido");
      if (data.method !== "card" && data.method !== "pix") throw new Error("Forma de pagamento inválida");
      validEnv(data.environment);
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<{ clientSecret: string } | { error: string }> => {
    const { userId } = context;
    try {
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        payment_method_types: data.method === "pix" ? ["pix"] : ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: data.amountCents,
              product_data: {
                name: "Créditos GoPet",
                description: "Saldo para usar nas corridas de transporte de pets",
              },
            },
          },
        ],
        metadata: { topupUserId: userId, kind: "credit_topup" },
        payment_intent_data: {
          description: `GoPet — recarga de créditos (${userId})`,
          metadata: { topupUserId: userId, kind: "credit_topup" },
        },
      });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("credit_transactions").insert({
        user_id: userId,
        kind: "topup",
        amount_cents: data.amountCents,
        status: "pending",
        payment_method: data.method,
        description: data.method === "pix" ? "Recarga via Pix" : "Recarga via cartão",
        environment: data.environment,
        stripe_session_id: session.id,
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (err) {
      return { error: getStripeErrorMessage(err) };
    }
  });

/** Confirma no Stripe o resultado da recarga e credita o saldo. */
export const syncCreditTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string; environment: StripeEnv }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.sessionId)) throw new Error("Sessão inválida");
    validEnv(data.environment);
    return data;
  })
  .handler(async ({ data, context }): Promise<{ status: string } | { error: string }> => {
    try {
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: tx } = await supabaseAdmin
        .from("credit_transactions")
        .select("id, user_id, status")
        .eq("stripe_session_id", data.sessionId)
        .maybeSingle();
      if (!tx || tx.user_id !== context.userId) return { error: "Recarga não encontrada" };

      if (session.payment_status === "paid" && tx.status === "pending") {
        await supabaseAdmin
          .from("credit_transactions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            stripe_payment_intent:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent?.id ?? null),
          })
          .eq("id", tx.id);
        return { status: "completed" };
      }

      return { status: tx.status };
    } catch (err) {
      return { error: getStripeErrorMessage(err) };
    }
  });
