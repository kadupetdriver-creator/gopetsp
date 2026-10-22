import { isActiveStatus, isUnderwayStatus, type RideStatus } from "./rides";
import { driverShareCents } from "./pricing";

type AdminRideState = { status: RideStatus; driver_id: string | null; paid_at: string | null; driver_requested_at?: string | null };
export type RideFilter = "todas" | "orcamentos" | "disponiveis" | "aceitas" | "andamento" | "completed" | "cancelled";

export function isAvailableRide(ride: AdminRideState) {
  return ride.status === "pending" && !ride.driver_id && Boolean(ride.paid_at) && Boolean(ride.driver_requested_at);
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

export function adminRideAmounts(priceCents: number) {
  return { totalCents: priceCents, driverCents: driverShareCents(priceCents) };
}