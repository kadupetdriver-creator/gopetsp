import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

const PLATFORM_FEE_RATE = 0.2;
const CANCELLATION_FEE_RATE = 0.2;

type CheckoutResult = { clientSecret: string } | { error: string };
type ActionResult = { status: string } | { error: string };

function validEnv(env: unknown): StripeEnv {
  if (env === "sandbox" || env === "live") return env;
  throw new Error("Ambiente de pagamento inválido");
}

function isUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

/** Cria (ou reaproveita) a cobrança da corrida e devolve o clientSecret do checkout. */
export const createRideCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rideId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!isUuid(data.rideId)) throw new Error("Corrida inválida");
    validEnv(data.environment);
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;

    const { data: ride, error } = await supabase
      .from("rides")
      .select("id, tutor_id, driver_id, pet_name, price_cents, status")
      .eq("id", data.rideId)
      .maybeSingle();
    if (error || !ride) return { error: "Corrida não encontrada" };
    if (ride.tutor_id !== userId) return { error: "Somente o tutor pode pagar esta corrida" };
    if (ride.status === "cancelled" || ride.status === "completed")
      return { error: "Esta corrida não está mais disponível para pagamento" };

    const amountCents = ride.price_cents;
    if (!amountCents || amountCents < 500) return { error: "Valor da corrida inválido" };
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
    const driverAmountCents = amountCents - platformFeeCents;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: existing } = await supabaseAdmin
        .from("ride_payments")
        .select("id, status")
        .eq("ride_id", ride.id)
        .maybeSingle();
      if (existing && ["held", "released"].includes(existing.status))
        return { error: "Esta corrida já foi paga" };

      const stripe = createStripeClient(data.environment);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: amountCents,
              product_data: {
                name: `Transporte pet — ${ride.pet_name}`,
                description: `Corrida PetMobi em São Paulo (${profile?.full_name ?? "tutor"})`,
              },
            },
          },
        ],
        payment_intent_data: {
          description: `PetMobi — corrida ${ride.id}`,
          metadata: {
            rideId: ride.id,
            userId,
            platformFeeCents: String(platformFeeCents),
            driverAmountCents: String(driverAmountCents),
          },
        },
        metadata: { rideId: ride.id, userId },
      });

      await supabaseAdmin.from("ride_payments").upsert(
        {
          ride_id: ride.id,
          tutor_id: ride.tutor_id,
          driver_id: ride.driver_id,
          amount_cents: amountCents,
          platform_fee_cents: platformFeeCents,
          driver_amount_cents: driverAmountCents,
          status: "pending",
          environment: data.environment,
          stripe_session_id: session.id,
        },
        { onConflict: "ride_id" },
      );

      return { clientSecret: session.client_secret ?? "" };
    } catch (err) {
      return { error: getStripeErrorMessage(err) };
    }
  });

/** Confirma no Stripe o resultado do checkout e atualiza o status retido (escrow). */
export const syncRidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string; environment: StripeEnv }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.sessionId)) throw new Error("Sessão inválida");
    validEnv(data.environment);
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult & { rideId?: string }> => {
    try {
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      const rideId = session.metadata?.["rideId"];
      if (!rideId) return { error: "Pagamento sem corrida vinculada" };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: payment } = await supabaseAdmin
        .from("ride_payments")
        .select("id, tutor_id, status")
        .eq("ride_id", rideId)
        .maybeSingle();
      if (!payment || payment.tutor_id !== context.userId)
        return { error: "Pagamento não encontrado" };

      if (session.payment_status === "paid" && payment.status === "pending") {
        await supabaseAdmin
          .from("ride_payments")
          .update({
            status: "held",
            paid_at: new Date().toISOString(),
            stripe_payment_intent:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent?.id ?? null),
          })
          .eq("id", payment.id);
        return { status: "held", rideId };
      }

      return { status: payment.status, rideId };
    } catch (err) {
      return { error: getStripeErrorMessage(err) };
    }
  });

/** Libera o repasse ao motorista depois que a corrida é concluída. */
export const releaseRidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rideId: string }) => {
    if (!isUuid(data.rideId)) throw new Error("Corrida inválida");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const { supabase, userId } = context;
    const { data: ride } = await supabase
      .from("rides")
      .select("id, tutor_id, driver_id, status")
      .eq("id", data.rideId)
      .maybeSingle();
    if (!ride) return { error: "Corrida não encontrada" };
    if (ride.tutor_id !== userId && ride.driver_id !== userId)
      return { error: "Sem permissão" };
    if (ride.status !== "completed") return { error: "A corrida ainda não foi concluída" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("ride_payments")
      .select("id, status")
      .eq("ride_id", ride.id)
      .maybeSingle();
    if (!payment) return { status: "none" };
    if (payment.status !== "held") return { status: payment.status };

    await supabaseAdmin
      .from("ride_payments")
      .update({
        status: "released",
        driver_id: ride.driver_id,
        released_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    return { status: "released" };
  });

/** Estorna (total ou parcial) quando a corrida é cancelada. */
export const refundRidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rideId: string; environment: StripeEnv }) => {
    if (!isUuid(data.rideId)) throw new Error("Corrida inválida");
    validEnv(data.environment);
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const { supabase, userId } = context;
    const { data: ride } = await supabase
      .from("rides")
      .select("id, tutor_id, driver_id, status")
      .eq("id", data.rideId)
      .maybeSingle();
    if (!ride) return { error: "Corrida não encontrada" };
    if (ride.tutor_id !== userId && ride.driver_id !== userId) return { error: "Sem permissão" };
    if (ride.status !== "cancelled") return { error: "A corrida não está cancelada" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("ride_payments")
      .select("id, status, amount_cents, stripe_payment_intent, environment")
      .eq("ride_id", ride.id)
      .maybeSingle();
    if (!payment) return { status: "none" };

    if (payment.status === "pending") {
      await supabaseAdmin.from("ride_payments").update({ status: "cancelled" }).eq("id", payment.id);
      return { status: "cancelled" };
    }
    if (payment.status !== "held") return { status: payment.status };

    // Cancelamento após o motorista aceitar retém a taxa de cancelamento.
    const feeCents = ride.driver_id ? Math.round(payment.amount_cents * CANCELLATION_FEE_RATE) : 0;
    const refundCents = payment.amount_cents - feeCents;

    try {
      const stripe = createStripeClient(data.environment);
      if (payment.stripe_payment_intent && refundCents > 0) {
        await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent,
          amount: refundCents,
        });
      }
      await supabaseAdmin
        .from("ride_payments")
        .update({
          status: "refunded",
          cancellation_fee_cents: feeCents,
          refunded_cents: refundCents,
          refunded_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      return { status: "refunded" };
    } catch (err) {
      return { error: getStripeErrorMessage(err) };
    }
  });
