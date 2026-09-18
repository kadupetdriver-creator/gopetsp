import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ActionResult = { status: string } | { error: string };

function isUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

/**
 * Solicita o reembolso integral ao Mercado Pago para uma corrida cancelada.
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
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (ride.tutor_id !== userId && !isAdmin) return { error: "Sem permissão" };
    if (ride.status !== "cancelled") return { error: "A corrida não está cancelada" };
    if (!ride.paid_at) return { status: "none" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payment } = await supabaseAdmin
      .from("mercadopago_payments")
      .select("id, mp_payment_id, status, refund_idempotency_key")
      .eq("ride_id", ride.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (!payment?.mp_payment_id) return { status: "none" };

    try {
      const { mercadoPagoRequest } = await import("./mercadopago.server");
      await mercadoPagoRequest(`/v1/payments/${encodeURIComponent(payment.mp_payment_id)}/refunds`, {
        method: "POST",
        body: "{}",
        idempotencyKey: payment.refund_idempotency_key,
      });
      await supabaseAdmin.from("mercadopago_payments").update({ status: "refunded" }).eq("id", payment.id);
      await supabaseAdmin.from("rides").update({ paid_at: null }).eq("id", ride.id);
      return { status: "refunded" };
    } catch (error) {
      console.error("Mercado Pago refund failed", error);
      return { error: error instanceof Error ? error.message : "Não foi possível concluir o reembolso." };
    }
  });
