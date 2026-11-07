import { waitingTimeLabel } from "@/lib/rides";

type ItineraryRide = {
  driver_waits?: boolean | null;
  waiting_minutes?: number | null;
  origin_address: string;
  destination_address: string;
  stops?: { address: string }[] | null;
};

/** Para corridas com espera: Ida (origem → destino) + espera + Volta (destino → origem). */
export function WaitingItinerary({ ride, className }: { ride: ItineraryRide; className?: string }) {
  const label = waitingTimeLabel(ride);
  if (!label) return null;
  const stops = (ride.stops ?? []).map((s) => s.address);
  const ida = [ride.origin_address, ...stops, ride.destination_address];
  const volta = [ride.destination_address, ...[...stops].reverse(), ride.origin_address];
  return (
    <div className={`space-y-1 rounded-lg border border-primary/40 bg-primary/10 p-2 text-sm ${className ?? ""}`}>
      <p><strong>Ida:</strong> {ida.join(" → ")}</p>
      <p className="font-semibold">{label}</p>
      <p><strong>Volta:</strong> {volta.join(" → ")}</p>
    </div>
  );
}
