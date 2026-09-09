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
  .inputValidator((data: { rideId: string; returnUrl: string; environment: StripeEnv; method?: "card" | "pix" }) => {
    if (!isUuid(data.rideId)) throw new Error("Corrida inválida");
    validEnv(data.environment);
    if (data.method && data.method !== "card" && data.method !== "pix")
      throw new Error("Forma de pagamento inválida");
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
        payment_method_types: data.method === "pix" ? ["pix"] : ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: amountCents,
              product_data: {
                name: `Transporte pet — ${ride.pet_name}`,
                description: `Corrida GoPet em São Paulo (${profile?.full_name ?? "tutor"})`,
              },
            },
          },
        ],
        payment_intent_data: {
          description: `GoPet — corrida ${ride.id}`,
          transfer_group: `ride_${ride.id}`,
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
          transfer_group: `ride_${ride.id}`,
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

/**
 * Libera o repasse ao motorista depois que a corrida é concluída.
 * Somente o motorista da corrida pode disparar; o estado final é decidido
 * pelo backend e o banco só aceita "released" com repasse efetivamente feito.
 */
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
    if (!ride.driver_id || ride.driver_id !== userId)
      return { error: "Somente o motorista da corrida pode solicitar o repasse" };
    if (ride.status !== "completed") return { error: "A corrida ainda não foi concluída" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment } = await supabaseAdmin
      .from("ride_payments")
      .select(
        "id, status, driver_amount_cents, transfer_group, environment, payment_method, stripe_transfer_id",
      )
      .eq("ride_id", ride.id)
      .maybeSingle();
    if (!payment) return { status: "none" };
    if (payment.status !== "held") return { status: payment.status };

    // Pagamento com saldo: o repasse vira crédito na carteira do motorista.
    if (payment.payment_method === "credits") {
      const { error: payoutError } = await supabaseAdmin.from("credit_transactions").insert({
        user_id: ride.driver_id,
        kind: "payout",
        amount_cents: payment.driver_amount_cents,
        status: "completed",
        payment_method: "credits",
        description: "Repasse de corrida concluída",
        ride_id: ride.id,
        completed_at: new Date().toISOString(),
      });
      // 23505 = repasse já registrado antes (operação repetida é segura).
      if (payoutError && payoutError.code !== "23505")
        return { error: "Não foi possível registrar o repasse. Tente novamente." };

      const { error: updateError } = await supabaseAdmin
        .from("ride_payments")
        .update({ status: "released", driver_id: ride.driver_id })
        .eq("id", payment.id)
        .eq("status", "held");
      if (updateError) return { error: "Não foi possível concluir o repasse." };
      return { status: "released" };
    }

    // Repasse via Stripe Connect: exige conta habilitada do motorista.
    const { data: driver } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, payouts_enabled")
      .eq("id", ride.driver_id)
      .maybeSingle();
    if (!driver?.stripe_account_id || !driver.payouts_enabled) {
      // Sem conta de recebimento o valor continua retido — nunca marcamos released.
      return { status: "pending_payout" };
    }

    let transferId = payment.stripe_transfer_id;
    if (!transferId) {
      try {
        const stripe = createStripeClient(payment.environment === "live" ? "live" : "sandbox");
        const transfer = await stripe.transfers.create(
          {
            amount: payment.driver_amount_cents,
            currency: "brl",
            destination: driver.stripe_account_id,
            transfer_group: payment.transfer_group ?? `ride_${ride.id}`,
            metadata: { rideId: ride.id },
          },
          // Idempotência: uma corrida nunca gera duas transferências.
          { idempotencyKey: `ride_transfer_${ride.id}` },
        );
        transferId = transfer.id;
      } catch (err) {
        return { error: getStripeErrorMessage(err) };
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("ride_payments")
      .update({
        status: "released",
        driver_id: ride.driver_id,
        stripe_transfer_id: transferId,
        released_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("status", "held");
    if (updateError) return { error: "Não foi possível concluir o repasse." };
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
      .select("id, status, amount_cents, stripe_payment_intent, environment, payment_method")
      .eq("ride_id", ride.id)
      .maybeSingle();
    if (!payment) return { status: "none" };

    if (payment.status === "pending") {
      await supabaseAdmin
        .from("ride_payments")
        .update({ status: "cancelled" })
        .eq("id", payment.id)
        .eq("status", "pending");
      return { status: "cancelled" };
    }
    if (payment.status !== "held") return { status: payment.status };

    // Cancelamento após o motorista aceitar retém a taxa de cancelamento.
    const feeCents = ride.driver_id ? Math.round(payment.amount_cents * CANCELLATION_FEE_RATE) : 0;
    const refundCents = payment.amount_cents - feeCents;

    // Pagamento feito com saldo volta como crédito na carteira, na hora.
    if (payment.payment_method === "credits") {
      if (refundCents > 0) {
        const { error: refundError } = await supabaseAdmin.from("credit_transactions").insert({
          user_id: ride.tutor_id,
          kind: "refund",
          amount_cents: refundCents,
          status: "completed",
          payment_method: "credits",
          description: "Estorno de corrida cancelada",
          ride_id: ride.id,
          completed_at: new Date().toISOString(),
        });
        // 23505 = estorno já registrado antes; repetir a operação é seguro.
        if (refundError && refundError.code !== "23505")
          return { error: "Não foi possível registrar o estorno. Tente novamente." };
      }
      await supabaseAdmin
        .from("ride_payments")
        .update({
          status: "refunded",
          cancellation_fee_cents: feeCents,
          refunded_cents: refundCents,
          refunded_at: new Date().toISOString(),
        })
        .eq("id", payment.id)
        .eq("status", "held");
      return { status: "refunded" };
    }

    try {
      const stripe = createStripeClient(data.environment);
      if (payment.stripe_payment_intent && refundCents > 0) {
        await stripe.refunds.create(
          {
            payment_intent: payment.stripe_payment_intent,
            amount: refundCents,
          },
          // Idempotência: uma corrida nunca gera dois estornos.
          { idempotencyKey: `ride_refund_${ride.id}` },
        );
      }
      await supabaseAdmin
        .from("ride_payments")
        .update({
          status: "refunded",
          cancellation_fee_cents: feeCents,
          refunded_cents: refundCents,
          refunded_at: new Date().toISOString(),
        })
        .eq("id", payment.id)
        .eq("status", "held");
      return { status: "refunded" };
    } catch (err) {
      return { error: getStripeErrorMessage(err) };
    }
  });


type PayoutStatus = {
  connected: boolean;
  payoutsEnabled: boolean;
  onboardingUrl?: string;
};

/** Cria/recupera a conta de recebimento do motorista e devolve o link de cadastro. */
export const startDriverPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl: string; environment: StripeEnv }) => {
    validEnv(data.environment);
    return data;
  })
  .handler(async ({ data, context }): Promise<PayoutStatus | { error: string }> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, stripe_account_id, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.role !== "driver")
      return { error: "Apenas motoristas parceiros podem configurar recebimentos" };

    try {
      const stripe = createStripeClient(data.environment);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let accountId = profile.stripe_account_id;

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          country: "BR",
          capabilities: { transfers: { requested: true } },
          business_type: "individual",
          metadata: { userId },
        });
        accountId = account.id;
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_account_id: accountId })
          .eq("id", userId);
      }

      const account = await stripe.accounts.retrieve(accountId);
      const payoutsEnabled = Boolean(account.payouts_enabled);
      await supabaseAdmin
        .from("profiles")
        .update({ payouts_enabled: payoutsEnabled, payouts_checked_at: new Date().toISOString() })
        .eq("id", userId);

      if (payoutsEnabled) return { connected: true, payoutsEnabled: true };

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: data.returnUrl,
        return_url: data.returnUrl,
        type: "account_onboarding",
      });
      return { connected: true, payoutsEnabled: false, onboardingUrl: link.url };
    } catch (err) {
      return { error: getStripeErrorMessage(err) };
    }
  });

/** Reconsulta no Stripe se o motorista já pode receber repasses. */
export const refreshDriverPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: StripeEnv }) => {
    validEnv(data.environment);
    return data;
  })
  .handler(async ({ data, context }): Promise<PayoutStatus | { error: string }> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.stripe_account_id) return { connected: false, payoutsEnabled: false };
    try {
      const stripe = createStripeClient(data.environment);
      const account = await stripe.accounts.retrieve(profile.stripe_account_id);
      const payoutsEnabled = Boolean(account.payouts_enabled);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("profiles")
        .update({ payouts_enabled: payoutsEnabled, payouts_checked_at: new Date().toISOString() })
        .eq("id", userId);
      return { connected: true, payoutsEnabled };
    } catch (err) {
      return { error: getStripeErrorMessage(err) };
    }
  });
