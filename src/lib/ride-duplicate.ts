import { supabase } from "@/integrations/supabase/client";
import type { SelectedPlace } from "@/components/AddressAutocomplete";

/** Dados de uma corrida existente reaproveitáveis num novo pedido (sem data, preço ou pagamento). */
export type RideTemplate = {
  tutorId: string;
  petIds: string[];
  serviceType: string;
  origin: SelectedPlace | null;
  destination: SelectedPlace | null;
  stops: SelectedPlace[];
  notes: string;
  needsTrunk: boolean;
  accompanies: boolean | null;
  peopleCount: number | null;
  hasReturn: boolean;
  driverWaits: boolean;
};

const place = (address: string | null, neighborhood: string | null, lat: number | null, lng: number | null): SelectedPlace | null =>
  address && lat != null && lng != null ? { address, neighborhood, lat, lng, hasStreetNumber: /\d/.test(address) } : null;

export async function loadRideTemplate(rideId: string): Promise<RideTemplate> {
  const [{ data: r, error }, { data: links }] = await Promise.all([
    supabase.from("rides").select("tutor_id, pet_id, service_type, origin_address, origin_neighborhood, origin_lat, origin_lng, destination_address, destination_neighborhood, destination_lat, destination_lng, stops, notes, needs_trunk, tutor_accompanies_pet, accompanying_people_count, has_return, driver_waits, return_of_ride_id").eq("id", rideId).single(),
    supabase.from("ride_pets").select("pet_id").eq("ride_id", rideId),
  ]);
  if (error || !r) throw new Error("Não foi possível carregar a corrida para duplicar.");
  const petIds = [...new Set([...(links ?? []).map((l) => l.pet_id), ...(r.pet_id ? [r.pet_id] : [])])];
  const stops = (Array.isArray(r.stops) ? r.stops : [])
    .map((s) => { const o = s as { address?: string; neighborhood?: string | null; lat?: number; lng?: number }; return place(o.address ?? null, o.neighborhood ?? null, o.lat ?? null, o.lng ?? null); })
    .filter((s): s is SelectedPlace => !!s);
  return {
    tutorId: r.tutor_id, petIds, serviceType: r.service_type,
    origin: place(r.origin_address, r.origin_neighborhood, r.origin_lat, r.origin_lng),
    destination: place(r.destination_address, r.destination_neighborhood, r.destination_lat, r.destination_lng),
    stops, notes: r.notes ?? "", needsTrunk: r.needs_trunk,
    accompanies: r.tutor_accompanies_pet, peopleCount: r.accompanying_people_count,
    hasReturn: r.has_return && !r.return_of_ride_id, driverWaits: r.driver_waits,
  };
}

/** Grava o modelo como rascunho do pedido do tutor; /solicitar o restaura e recalcula o preço atual. */
export function writeTutorDraft(userId: string, t: RideTemplate) {
  window.localStorage.setItem(`gopet:solicitar-draft:${userId}`, JSON.stringify({
    selectedPetIds: t.petIds, serviceType: t.serviceType,
    originAddress: t.origin?.address ?? "", origin: t.origin,
    destinationAddress: t.destination?.address ?? "", destination: t.destination,
    stops: t.stops.map((p) => ({ text: p.address, place: p })),
    notes: t.notes, needsTrunk: t.needsTrunk, tutorAccompaniesPet: t.accompanies,
    accompanyingPeopleCount: t.peopleCount ? String(t.peopleCount) : "",
    hasReturn: t.hasReturn, returnAt: "", driverWaits: t.hasReturn ? t.driverWaits : null,
  }));
}
