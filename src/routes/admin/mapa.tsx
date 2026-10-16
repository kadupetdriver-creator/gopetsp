import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLiveMap, type LiveDriver } from "@/components/AdminLiveMap";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { activeStatuses, formatDateTime, statusLabels, type RideStatus } from "@/lib/rides";

export const Route = createFileRoute("/admin/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa ao vivo dos motoristas | GoPet Admin" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Posição em tempo real dos motoristas em corrida." },
      { property: "og:title", content: "Mapa ao vivo dos motoristas | GoPet Admin" },
      { property: "og:description", content: "Posição em tempo real dos motoristas em corrida." },
    ],
  }),
  component: AdminMapaPage,
});

type ActiveRideRow = {
  id: string;
  driver_id: string;
  pet_name: string;
  status: RideStatus;
  driver_lat: number | null;
  driver_lng: number | null;
  location_updated_at: string | null;
};

function AdminMapaPage() {
  const qc = useQueryClient();

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["admin-live-drivers"],
    refetchInterval: 10000,
    queryFn: async (): Promise<LiveDriver[]> => {
      const { data: rides, error } = await supabase
        .from("rides")
        .select("id, driver_id, pet_name, status, driver_lat, driver_lng, location_updated_at")
        .in("status", activeStatuses)
        .not("driver_id", "is", null);
      if (error) throw error;

      const rows = (rides ?? []) as unknown as ActiveRideRow[];
      const withPosition = rows.filter(
        (r) => typeof r.driver_lat === "number" && typeof r.driver_lng === "number",
      );
      if (withPosition.length === 0) return [];

      const ids = [...new Set(withPosition.map((r) => r.driver_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

      return withPosition.map((r) => ({
        rideId: r.id,
        driverName: names.get(r.driver_id) ?? "Motorista",
        petName: r.pet_name,
        status: statusLabels[r.status],
        lat: r.driver_lat!,
        lng: r.driver_lng!,
        updatedAt: r.location_updated_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-live-drivers")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides" }, () => {
        void qc.invalidateQueries({ queryKey: ["admin-live-drivers"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const list = drivers ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Mapa ao vivo</h2>
        <p className="text-sm text-muted-foreground">
          Posição em tempo real de cada motorista com corrida em andamento.
        </p>
      </div>

      {isLoading && <Skeleton className="h-[28rem] w-full rounded-2xl" />}

      {!isLoading && list.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum motorista com corrida em andamento enviando posição agora.
          </CardContent>
        </Card>
      )}

      {!isLoading && list.length > 0 && (
        <>
          <AdminLiveMap drivers={list} />
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((d) => (
              <Card key={d.rideId}>
                <CardContent className="flex items-start gap-3 py-4">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary-ink" />
                  <div className="text-sm">
                    <p className="font-semibold">
                      {d.driverName} <span className="font-normal text-muted-foreground">· {d.petName}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {d.status} · atualizado{" "}
                      {d.updatedAt ? formatDateTime(d.updatedAt) : "aguardando GPS"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
