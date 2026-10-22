import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canAdminCompleteRide, canAdminForwardRide } from "./admin-rides";
import { canAdminRescheduleRide, parseRescheduleInput } from "./ride-reschedule";

export const adminForwardRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ rideId: z.string().uuid(), driverId: z.string().uuid().nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Apenas administradores podem encaminhar corridas.");
    const { data: ride, error } = await context.supabase.from("rides")
      .select("id, status, driver_id, paid_at, driver_requested_at, updated_at").eq("id", data.rideId).maybeSingle();
    if (error || !ride) throw new Error("Corrida não encontrada.");
    if (!canAdminForwardRide(ride) || !ride.paid_at) throw new Error("Só é possível encaminhar corridas pagas que ainda não iniciaram o transporte.");
    if (data.driverId) {
      const { data: driver, error: driverError } = await context.supabase.from("drivers")
        .select("id").eq("user_id", data.driverId).eq("status", "aprovado").maybeSingle();
      if (driverError || !driver) throw new Error("Escolha um motorista aprovado.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const requestedAt = ride.driver_requested_at ?? new Date().toISOString();
    const status = data.driverId ? "accepted" : "pending";
    const { data: updated, error: updateError } = await supabaseAdmin.from("rides")
      .update({ driver_id: data.driverId, status, driver_requested_at: requestedAt, preferred_driver_id: null, preferred_until: null })
      .eq("id", ride.id).eq("updated_at", ride.updated_at).eq("status", ride.status)
      .eq("paid_at", ride.paid_at).select("id").maybeSingle();
    if (updateError || !updated) throw new Error("A corrida mudou enquanto você encaminhava. Atualize e tente novamente.");
    console.info("[admin-ride-forwarded]", {
      rideId: ride.id, adminId: context.userId, previousDriverId: ride.driver_id,
      driverId: data.driverId, previousStatus: ride.status, status, driverRequestedAt: requestedAt,
      at: new Date().toISOString(),
    });
    return { ok: true };
  });

export const adminRescheduleRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    rideId: z.string().uuid(), scheduledAt: z.string(), tutorRequested: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Apenas administradores podem alterar a data da corrida.");
    const scheduledAt = parseRescheduleInput(data.scheduledAt, data.tutorRequested);
    const { data: ride, error } = await context.supabase.from("rides")
      .select("id, status, scheduled_at, updated_at").eq("id", data.rideId).maybeSingle();
    if (error || !ride) throw new Error("Corrida não encontrada.");
    if (!canAdminRescheduleRide(ride.status)) throw new Error("Só é possível reagendar corridas que ainda não começaram.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: updateError } = await supabaseAdmin.from("rides")
      .update({ scheduled_at: scheduledAt }).eq("id", ride.id).eq("status", ride.status)
      .eq("updated_at", ride.updated_at).select("id").maybeSingle();
    if (updateError || !updated) throw new Error("A corrida mudou enquanto você reagendava. Atualize e tente novamente.");
    console.info("[admin-ride-rescheduled]", {
      rideId: ride.id, adminId: context.userId, tutorRequested: true,
      previousScheduledAt: ride.scheduled_at, scheduledAt, at: new Date().toISOString(),
    });
    return { ok: true };
  });

export const adminCompleteRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ rideId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Apenas administradores podem finalizar corridas manualmente.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ride, error } = await supabaseAdmin.from("rides")
      .select("id, status, driver_id, paid_at").eq("id", data.rideId).maybeSingle();
    if (error || !ride) throw new Error("Corrida não encontrada.");
    if (ride.status === "completed") return { ok: true };
    if (!canAdminCompleteRide(ride) || !ride.driver_id || !ride.paid_at) throw new Error("Só é possível finalizar corridas pagas, abertas e com motorista atribuído.");
    const { data: updated, error: updateError } = await supabaseAdmin.from("rides")
      .update({ status: "completed" })
      .eq("id", ride.id).eq("status", ride.status).eq("driver_id", ride.driver_id)
      .eq("paid_at", ride.paid_at).select("id").maybeSingle();
    if (updateError || !updated) throw new Error("A corrida mudou enquanto você finalizava. Atualize e tente novamente.");
    console.info("[admin-ride-completed]", { rideId: ride.id, adminId: context.userId, previousStatus: ride.status, status: "completed", at: new Date().toISOString() });
    return { ok: true };
  });