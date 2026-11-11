import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CANCELLATION_FEES_ACTIVE, canTutorCancel, cancellationQuote, driverShareOfFee } from "./cancellation-policy";

const RIDE_COLS = "id, tutor_id, driver_id, status, scheduled_at, price_cents, paid_at, arrived_at, en_route_at, driver_fixed_cents";

export const quoteTutorCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ rideId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ride, error } = await context.supabase.from("rides").select(RIDE_COLS).eq("id", data.rideId).maybeSingle();
    if (error || !ride || ride.tutor_id !== context.userId) throw new Error("Corrida não encontrada.");
    if (!canTutorCancel(ride.status)) throw new Error("Esta corrida não pode mais ser cancelada pelo app.");
    return { ...cancellationQuote(ride), priceCents: ride.price_cents, feesActive: CANCELLATION_FEES_ACTIVE, paid: !!ride.paid_at };
  });

export const cancelRideAsTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    rideId: z.string().uuid(), reason: z.string().trim().max(500).optional(), confirmed: z.literal(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ride, error } = await context.supabase.from("rides").select(RIDE_COLS).eq("id", data.rideId).maybeSingle();
    if (error || !ride || ride.tutor_id !== context.userId) throw new Error("Corrida não encontrada.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (ride.status === "cancelled") {
      const { data: existing } = await supabaseAdmin.from("ride_cancellations").select("id").eq("ride_id", ride.id).maybeSingle();
      if (existing) return { ok: true, alreadyCancelled: true };
    }
    if (!canTutorCancel(ride.status)) throw new Error("Esta corrida não pode mais ser cancelada pelo app.");
    const now = new Date();
    const quote = cancellationQuote(ride, now);
    // Transição de status pelas regras já existentes (condicional ao status atual).
    const { error: statusError } = await context.supabase.rpc("set_ride_status", { _ride_id: ride.id, _status: "cancelled" });
    if (statusError) throw new Error("Não foi possível cancelar: a corrida mudou. Atualize e tente novamente.");
    const { error: insertError } = await supabaseAdmin.from("ride_cancellations").upsert({
      ride_id: ride.id, tutor_id: ride.tutor_id, driver_id: ride.driver_id, cancelled_by: context.userId,
      cancelled_at: now.toISOString(), scheduled_at: ride.scheduled_at, reason: data.reason || null,
      previous_status: ride.status, driver_state: quote.driverState,
      en_route_at: ride.en_route_at, arrived_at: ride.arrived_at, was_paid: !!ride.paid_at,
      tier: quote.tier, rate_percent: quote.ratePercent, ride_price_cents: ride.price_cents,
      fee_cents: quote.feeCents, original_fee_cents: quote.feeCents, refund_cents: quote.refundCents,
      driver_share_cents: quote.driverShareCents, fees_active: CANCELLATION_FEES_ACTIVE,
    }, { onConflict: "ride_id", ignoreDuplicates: true });
    if (insertError) console.error("[ride-cancellation-log-failed]", { rideId: ride.id, error: insertError.message });
    console.info("[ride-cancelled-by-tutor]", { rideId: ride.id, tutorId: context.userId, tier: quote.tier, feeCents: quote.feeCents, at: now.toISOString() });
    return { ok: true, alreadyCancelled: false };
  });

export const adminListCancellations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (isAdmin !== true) throw new Error("Apenas administradores.");
    const { data: rows, error } = await context.supabase.from("ride_cancellations").select("*").order("cancelled_at", { ascending: false }).limit(1000);
    if (error) throw new Error("Não foi possível carregar os cancelamentos.");
    const ids = [...new Set(rows.flatMap((r) => [r.tutor_id, r.driver_id]).filter(Boolean) as string[])];
    const rideIds = rows.map((r) => r.ride_id);
    const [{ data: people }, { data: rides }] = await Promise.all([
      ids.length ? context.supabase.from("profiles").select("id, full_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      rideIds.length ? context.supabase.from("rides").select("id, pet_name").in("id", rideIds) : Promise.resolve({ data: [] as { id: string; pet_name: string }[] }),
    ]);
    const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
    const pet = new Map((rides ?? []).map((r) => [r.id, r.pet_name]));
    return rows.map((r) => ({ ...r, tutor_name: name.get(r.tutor_id) ?? "—", driver_name: r.driver_id ? name.get(r.driver_id) ?? "—" : null, pet_name: pet.get(r.ride_id) ?? "—" }));
  });

export const adminSetCancellationException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid(),
    kind: z.enum(["gopet_failure", "driver_failure", "other"]).nullable(),
    notes: z.string().trim().max(1000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (isAdmin !== true) throw new Error("Apenas administradores podem autorizar exceções.");
    if (data.kind && data.notes.length < 5) throw new Error("Descreva a justificativa da exceção.");
    const { data: row, error } = await context.supabase.from("ride_cancellations").select("*").eq("id", data.id).maybeSingle();
    if (error || !row) throw new Error("Cancelamento não encontrado.");
    const fee = data.kind ? 0 : row.original_fee_cents;
    const { data: rideRow } = await context.supabase.from("rides").select("driver_fixed_cents").eq("id", row.ride_id).maybeSingle();
    const driverShare = data.kind ? 0 : driverShareOfFee(fee, row.ride_price_cents, rideRow?.driver_fixed_cents);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.from("ride_cancellations").update({
      exception_kind: data.kind, exception_notes: data.kind ? data.notes : null,
      exception_by: context.userId, exception_at: new Date().toISOString(),
      fee_cents: fee, rate_percent: data.kind ? 0 : Math.round((row.original_fee_cents * 100) / Math.max(row.ride_price_cents, 1)),
      refund_cents: row.was_paid ? row.ride_price_cents - fee : 0, driver_share_cents: driverShare,
    }).eq("id", row.id).eq("updated_at", row.updated_at);
    if (upErr) throw new Error("Não foi possível salvar. Atualize e tente novamente.");
    console.info("[admin-cancellation-exception]", { id: row.id, rideId: row.ride_id, adminId: context.userId, kind: data.kind, notes: data.notes, at: new Date().toISOString() });
    return { ok: true };
  });
