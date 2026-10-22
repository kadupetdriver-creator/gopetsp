export type RideRequestState = {
  status: string;
  paid_at: string | null;
  driver_requested_at: string | null;
};

export function canRequestRideDriver(ride: RideRequestState) {
  return ride.status === "pending" && Boolean(ride.paid_at) && !ride.driver_requested_at;
}

export function isRideReleased(ride: RideRequestState) {
  return Boolean(ride.paid_at) && Boolean(ride.driver_requested_at);
}