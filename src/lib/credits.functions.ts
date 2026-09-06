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

/** Saldo disponível (em centavos) do usuário autenticado. */
export const getCreditBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ balanceCents: number }> => {
    const { data } = await context.supabase.rpc("my_credit_balance_cents");
    return { balanceCents: typeof data === "number" ? data : 0 };
  });

/** Paga a corrida usando o saldo de créditos do tutor (sem cartão/Pix). */
export const payRideWithCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rideId: string }) => {
    if (!/^[0-9a-fA-F-]{36}$/.test(data.rideId)) throw new Error("Corrida inválida");
    return data;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ status: string } | { error: string; balanceCents?: number }> => {
      const { supabase, userId } = context;

      const { data: ride } = await supabase
        .from("rides")
        .select("id, tutor_id, driver_id, price_cents, status")
        .eq("id", data.rideId)
        .maybeSingle();
      if (!ride) return { error: "Corrida não encontrada" };
      if (ride.tutor_id !== userId) return { error: "Somente o tutor pode pagar esta corrida" };
      if (ride.status === "cancelled" || ride.status === "completed")
        return { error: "Esta corrida não está mais disponível para pagamento" };

      const amountCents = ride.price_cents;
      if (!amountCents || amountCents < 500) return { error: "Valor da corrida inválido" };

      const { data: balance } = await supabase.rpc("my_credit_balance_cents");
      const balanceCents = typeof balance === "number" ? balance : 0;
      if (balanceCents < amountCents)
        return { error: "Saldo insuficiente para pagar esta corrida", balanceCents };

      const platformFeeCents = Math.round(amountCents * 0.2);
      const driverAmountCents = amountCents - platformFeeCents;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing } = await supabaseAdmin
        .from("ride_payments")
        .select("id, status")
        .eq("ride_id", ride.id)
        .maybeSingle();
      if (existing && ["held", "released"].includes(existing.status))
        return { error: "Esta corrida já foi paga" };

      const { error: spendError } = await supabaseAdmin.from("credit_transactions").insert({
        user_id: userId,
        kind: "spend",
        amount_cents: amountCents,
        status: "completed",
        payment_method: "credits",
        description: "Pagamento de corrida com saldo",
        ride_id: ride.id,
        completed_at: new Date().toISOString(),
      });
      if (spendError) return { error: "Não foi possível debitar o saldo. Tente novamente." };

      await supabaseAdmin.from("ride_payments").upsert(
        {
          ride_id: ride.id,
          tutor_id: ride.tutor_id,
          driver_id: ride.driver_id,
          amount_cents: amountCents,
          platform_fee_cents: platformFeeCents,
          driver_amount_cents: driverAmountCents,
          status: "held",
          environment: "sandbox",
          payment_method: "credits",
          transfer_group: `ride_${ride.id}`,
          paid_at: new Date().toISOString(),
        },
        { onConflict: "ride_id" },
      );

      return { status: "held" };
    },
  );
