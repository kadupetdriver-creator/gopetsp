import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Taxa retida quando o tutor cancela após o motorista aceitar. */
const CANCELLATION_FEE_RATE = 0.2;

type ActionResult = { status: string } | { error: string };

function isUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

/**
 * Devolve o saldo ao tutor quando a corrida é cancelada.
 * Não existe repasse: o valor pago é integralmente da GoPet, e o estorno
 * apenas recoloca créditos na carteira do tutor.
 */
export const refundRidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rideId: string }) => {
    if (!isUuid(data.rideId)) throw new Error("Corrida inválida");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const { supabase, userId } = context;
    const { data: ride } = await supabase
      .from("rides")
      .select("id, tutor_id, driver_id, status, price_cents, paid_at")
      .eq("id", data.rideId)
      .maybeSingle();
    if (!ride) return { error: "Corrida não encontrada" };
    if (ride.tutor_id !== userId && ride.driver_id !== userId) return { error: "Sem permissão" };
    if (ride.status !== "cancelled") return { error: "A corrida não está cancelada" };
    if (!ride.paid_at) return { status: "none" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cancelamento após o motorista aceitar retém a taxa de cancelamento.
    const feeCents = ride.driver_id ? Math.round(ride.price_cents * CANCELLATION_FEE_RATE) : 0;
    const refundCents = ride.price_cents - feeCents;

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

    return { status: "refunded" };
  });
