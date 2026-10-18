import { useQuery } from "@tanstack/react-query";
import { getRideDriverDetails } from "@/lib/rides.functions";

export function RideDriverIdentity({ rideId }: { rideId: string }) {
  const { data: driver } = useQuery({
    queryKey: ["ride-driver-identity", rideId],
    queryFn: () => getRideDriverDetails({ data: { rideId } }),
  });

  if (!driver) return null;
  return (
    <div className="flex items-center gap-3">
      {driver.avatarUrl ? (
        <img src={driver.avatarUrl} alt={`Foto de ${driver.fullName ?? "motorista"}`} className="size-14 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
          {(driver.fullName ?? "G").trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 text-sm">
        <p className="font-semibold break-words">{driver.fullName ?? "Parceiro GoPet"}</p>
        <p className="text-muted-foreground break-words">
          {[driver.vehiclePlate?.toUpperCase(), driver.vehicleBrand, driver.vehicleModel, driver.vehicleColor].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}