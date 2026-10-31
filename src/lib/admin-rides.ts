import { isActiveStatus, isUnderwayStatus, type RideStatus } from "./rides";
import { driverPayoutCents } from "./pricing";

type AdminRideState = { status: RideStatus; driver_id: string | null; paid_at: string | null; driver_requested_at?: string | null };
export type RideFilter = "todas" | "orcamentos" | "disponiveis" | "aceitas" | "andamento" | "completed" | "cancelled";

export function isAvailableRide(ride: AdminRideState) {
  return ride.status === "pending" && !ride.driver_id && Boolean(ride.paid_at);
}

export function canAdminForwardRide(ride: AdminRideState) {
  return Boolean(ride.paid_at) && ["pending", "accepted", "en_route"].includes(ride.status);
}

export function matchesAdminRideFilter(ride: AdminRideState, filter: RideFilter) {
  if (filter === "orcamentos") return !ride.paid_at;
  if (!ride.paid_at) return false;
  switch (filter) {
    case "disponiveis": return isAvailableRide(ride);
    case "aceitas": return ride.status === "accepted" && Boolean(ride.driver_id);
    case "andamento": return isUnderwayStatus(ride.status);
    case "completed": return ride.status === "completed";
    case "cancelled": return ride.status === "cancelled";
    default: return true;
  }
}

export function canAdminCompleteRide(ride: AdminRideState) {
  return isActiveStatus(ride.status) && Boolean(ride.driver_id) && Boolean(ride.paid_at);
}

export const adminRidePhases = [
  { value: "en_route", label: "A caminho" },
  { value: "arrived", label: "Cheguei" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Finalizar" },
] as const;
export type AdminRidePhase = typeof adminRidePhases[number]["value"];

export function adminRidePhase(ride: { status: RideStatus; arrived_at: string | null }): AdminRidePhase | null {
  if (ride.status === "en_route") return ride.arrived_at ? "arrived" : "en_route";
  if (ride.status === "in_progress" || ride.status === "completed") return ride.status;
  return null;
}

export function adminRidePhaseUpdate(
  ride: AdminRideState & { arrived_at: string | null }, phase: AdminRidePhase, now: string,
) {
  if (!canAdminCompleteRide(ride)) throw new Error("Só é possível alterar fases de corridas pagas, abertas e com motorista atribuído.");
  if (!adminRidePhases.some((option) => option.value === phase)) throw new Error("Fase inválida.");
  return {
    status: phase === "arrived" ? "en_route" as const : phase,
    arrived_at: phase === "en_route" ? null : phase === "arrived" ? (ride.arrived_at ?? now) : ride.arrived_at,
  };
}

export function adminRideAmounts(priceCents: number, driverFixedCents?: number | null) {
  return { totalCents: priceCents, driverCents: driverPayoutCents({ priceCents, driverFixedCents: driverFixedCents ?? null }) };
}