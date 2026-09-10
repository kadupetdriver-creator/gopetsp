import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RideMap } from "@/components/RideMap";
import {
  activeStatuses,
  coordsFor,
  estimateMinutes,
  formatDateTime,
  statusLabels,
  statusStyles,
  type RideStatus,
} from "@/lib/rides";
import { cn } from "@/lib/utils";

type ActiveRide = {
  id: string;
  pet_name: string;
  status: RideStatus;
  distance_km: number;
  origin_neighborhood: string | null;
  destination_neighborhood: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  location_updated_at: string | null;
};

const cols =
  "id, pet_name, status, distance_km, origin_neighborhood, destination_neighborhood, origin_lat, origin_lng, destination_lat, destination_lng, driver_lat, driver_lng, location_updated_at";

/** Corrida aceita do tutor: fundo destacado e rastreio ao vivo do motorista. */
export function ActiveRideTracker() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: rides } = useQuery({
    queryKey: ["active-ride-tracker", user?.id],
    enabled: !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select(cols)
        .eq("tutor_id", user!.id)
        .in("status", activeStatuses)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as unknown as ActiveRide[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("active-ride-tracker")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides" }, () => {
        void qc.invalidateQueries({ queryKey: ["active-ride-tracker"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const list = rides ?? [];
  if (list.length === 0) return null;

  return (
    <div className="space-y-4">
      {list.map((ride) => (
        <Card key={ride.id} className="border-primary/50 bg-primary/10 shadow-soft">
          <CardContent className="space-y-3 py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                Motorista a caminho de {ride.pet_name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  chegada em ~{estimateMinutes(Number(ride.distance_km))} min
                </span>
              </p>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  statusStyles[ride.status],
                )}
              >
                {statusLabels[ride.status]}
              </span>
            </div>

            <RideMap
              origin={coordsFor(ride.origin_neighborhood, ride.origin_lat, ride.origin_lng)}
              destination={coordsFor(
                ride.destination_neighborhood,
                ride.destination_lat,
                ride.destination_lng,
              )}
              driver={
                typeof ride.driver_lat === "number" && typeof ride.driver_lng === "number"
                  ? [ride.driver_lat, ride.driver_lng]
                  : null
              }
              className="h-60 w-full rounded-2xl border border-border sm:h-72"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Posição atualizada:{" "}
                {ride.location_updated_at
                  ? formatDateTime(ride.location_updated_at)
                  : "aguardando sinal do motorista"}
              </p>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to="/minhas-corridas">Ver corrida</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default ActiveRideTracker;
