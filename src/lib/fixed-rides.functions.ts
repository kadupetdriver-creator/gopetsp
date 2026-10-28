import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFixedRideAdmin, parseFixedRide, type FixedRideInput } from "./fixed-rides";

export const adminCreateFixedRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FixedRideInput) => parseFixedRide(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    assertFixedRideAdmin(isAdmin, roleError);
    const [{ data: tutor, error: tutorError }, { data: pet, error: petError }] = await Promise.all([
      context.supabase.from("profiles").select("id").eq("id", data.tutorId).eq("role", "tutor").eq("is_active", true).maybeSingle(),
      context.supabase.from("pets").select("id, name, size").eq("id", data.petId).eq("owner_id", data.tutorId).maybeSingle(),
    ]);
    if (tutorError || !tutor) throw new Error("Escolha um tutor ativo.");
    if (petError || !pet) throw new Error("Escolha um pet cadastrado para este tutor.");
    const { drivingDistance } = await import("./routing.server");
    const route = await drivingDistance([data.origin.lat, data.origin.lng], [data.destination.lat, data.destination.lng]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: existingError } = await supabaseAdmin.from("rides").select("id, tutor_id, pet_id, service_type").eq("id", data.requestId).maybeSingle();
    if (existingError) throw new Error("Não foi possível verificar a criação da corrida.");
    if (existing && (existing.tutor_id !== data.tutorId || existing.pet_id !== data.petId || existing.service_type !== "Corrida fixa")) throw new Error("Identificador de corrida já utilizado.");
    if (!existing) {
      const { error } = await supabaseAdmin.from("rides").insert({
        id: data.requestId, tutor_id: data.tutorId, pet_id: pet.id, pet_name: pet.name, pet_size: pet.size,
        service_type: "Corrida fixa", price_cents: data.priceCents, distance_km: route.distanceKm,
        status: "pending", paid_at: null, driver_id: null, driver_requested_at: null, preferred_driver_id: null,
        origin_address: data.origin.address, origin_neighborhood: data.origin.neighborhood, origin_lat: data.origin.lat, origin_lng: data.origin.lng,
        destination_address: data.destination.address, destination_neighborhood: data.destination.neighborhood, destination_lat: data.destination.lat, destination_lng: data.destination.lng,
        scheduled_at: data.scheduledAt, notes: data.notes || null, stops: [], needs_trunk: false, trunk_fee_cents: 0,
        has_return: false, return_scheduled_at: null, return_fee_cents: 0, driver_waits: false, waiting_minutes: 0, waiting_fee_cents: 0,
        tutor_accompanies_pet: data.accompanies, accompanying_people_count: data.peopleCount,
      });
      if (error && error.code !== "23505") throw new Error("Não foi possível criar a corrida fixa.");
    }
    const { error: linkError } = await supabaseAdmin.from("ride_pets").upsert({ ride_id: data.requestId, pet_id: pet.id }, { onConflict: "ride_id,pet_id", ignoreDuplicates: true });
    if (linkError) throw new Error("Não foi possível vincular o pet. Tente salvar novamente para concluir.");
    console.info("[admin-fixed-ride-created]", { adminId: context.userId, rideId: data.requestId, tutorId: data.tutorId, priceCents: data.priceCents, at: new Date().toISOString() });
    return { rideId: data.requestId };
  });