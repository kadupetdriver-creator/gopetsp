import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MIN_TOPUP_CENTS = 2000;
export const MAX_TOPUP_CENTS = 500000;

/** Saldo disponível (em centavos) do usuário autenticado. */
export const getCreditBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ balanceCents: number }> => {
    const { data } = await context.supabase.rpc("my_credit_balance_cents");
    return { balanceCents: typeof data === "number" ? data : 0 };
  });

/** Paga a corrida usando o saldo GoPet do tutor. */
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
        .select("id, tutor_id, price_cents, status, paid_at")
        .eq("id", data.rideId)
        .maybeSingle();
      if (!ride) return { error: "Corrida não encontrada" };
      if (ride.tutor_id !== userId) return { error: "Somente o tutor pode pagar esta corrida" };
      if (ride.paid_at) return { error: "Esta corrida já foi paga" };
      if (ride.status === "cancelled" || ride.status === "completed")
        return { error: "Esta corrida não está mais disponível para pagamento" };

      const amountCents = ride.price_cents;
      if (!amountCents || amountCents < 500) return { error: "Valor da corrida inválido" };

      const { data: balance } = await supabase.rpc("my_credit_balance_cents");
      const balanceCents = typeof balance === "number" ? balance : 0;
      if (balanceCents < amountCents)
        return { error: "Saldo insuficiente para pagar esta corrida", balanceCents };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      // 23505 = a corrida já foi debitada antes; nunca cobramos duas vezes.
      if (spendError && spendError.code === "23505")
        return { error: "Esta corrida já foi paga" };
      if (spendError) return { error: "Não foi possível debitar o saldo. Tente novamente." };

      await supabaseAdmin
        .from("rides")
        .update({ paid_at: new Date().toISOString() })
        .eq("id", ride.id)
        .is("paid_at", null);

      return { status: "paid" };
    },
  );
