import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canRecordDriverPayment } from "./driver-payments";
import { driverShareCents } from "./pricing";
import { saoPauloScheduleInput } from "./ride-reschedule";

export const adminRecordDriverPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ rideId: z.string().uuid(), paidAt: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || admin !== true) throw new Error("Apenas administradores podem registrar pagamentos aos motoristas.");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.paidAt)) throw new Error("Informe a data e hora do pagamento.");
    const paidAt = new Date(`${data.paidAt}:00-03:00`);
    if (!Number.isFinite(paidAt.getTime()) || saoPauloScheduleInput(paidAt.toISOString()) !== data.paidAt || paidAt.getTime() > Date.now()) throw new Error("Informe uma data de pagamento válida, não futura.");
    const { data: ride, error } = await context.supabase.from("rides").select("id, status, driver_id, paid_at, price_cents").eq("id", data.rideId).maybeSingle();
    if (error || !ride || !canRecordDriverPayment(ride) || !ride.driver_id) throw new Error("Só é possível registrar pagamento de corrida concluída, paga pelo tutor e com motorista.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: readError } = await supabaseAdmin.from("driver_ride_payments").select("id").eq("ride_id", ride.id).maybeSingle();
    if (readError) throw new Error("Não foi possível consultar o pagamento.");
    if (existing) return { ok: true };
    const amountCents = driverShareCents(ride.price_cents);
    const { error: insertError } = await supabaseAdmin.from("driver_ride_payments").insert({ ride_id: ride.id, driver_id: ride.driver_id, amount_cents: amountCents, paid_at: paidAt.toISOString(), recorded_by: context.userId });
    if (insertError && insertError.code !== "23505") throw new Error("Não foi possível registrar o pagamento.");
    if (!insertError) console.info("[admin-driver-payment-recorded]", { rideId: ride.id, driverId: ride.driver_id, adminId: context.userId, amountCents, paidAt: paidAt.toISOString() });
    return { ok: true };
  });