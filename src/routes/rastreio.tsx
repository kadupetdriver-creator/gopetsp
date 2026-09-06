import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Navigation, Radio, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RideMap } from "@/components/RideMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/rastreio")({
  head: () => ({
    meta: [
      { title: "Rastreio ao vivo por GPS | GoPet" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real, pelo GPS, onde está o motorista que transporta o seu pet em São Paulo.",
      },
      { property: "og:title", content: "Rastreio ao vivo por GPS | GoPet" },
      {
        property: "og:description",
        content: "Mapa ao vivo com a posição do motorista durante o transporte do pet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RastreioPage,
});

type LiveRide = {
  id: string;
  pet_name: string;
  status: RideStatus;
  origin_address: string;
  origin_neighborhood: string | null;
  destination_address: string;
  destination_neighborhood: string | null;
  distance_km: number;
  scheduled_at: string;
  share_token: string;
  driver_lat: number | null;
  driver_lng: number | null;
  location_updated_at: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
};

const cols =
  "id, pet_name, status, origin_address, origin_neighborhood, destination_address, destination_neighborhood, distance_km, scheduled_at, share_token, driver_lat, driver_lng, location_updated_at, origin_lat, origin_lng, destination_lat, destination_lng";

function RastreioPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isDriver = profile?.role === "driver";

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: rides, isLoading } = useQuery({
    queryKey: ["live-rides", user?.id],
    enabled: !!user,
    refetchInterval: 20000,
    queryFn: async () => {
      const query = supabase.from("rides").select(cols).in("status", activeStatuses);
      const { data, error } = await (isDriver ? query.eq("driver_id", user!.id) : query);
      if (error) throw error;
      return data as unknown as LiveRide[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("live-tracking")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides" }, () => {
        void qc.invalidateQueries({ queryKey: ["live-rides"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const list = rides ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Rastreio ao vivo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDriver
            ? "Compartilhe sua posição pelo GPS enquanto transporta os pets."
            : "Veja no mapa, em tempo real, onde está o motorista do seu pet."}
        </p>
      </div>

      {isDriver && <DriverGpsPanel rides={list} />}

      {isLoading && <Skeleton className="h-72 w-full rounded-2xl" />}

      {!isLoading && list.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma corrida em andamento agora. O mapa ao vivo aparece assim que uma corrida for
            aceita.
          </CardContent>
        </Card>
      )}

      {list.map((ride) => (
        <LiveRideCard key={ride.id} ride={ride} />
      ))}
    </div>
  );
}

function LiveRideCard({ ride }: { ride: LiveRide }) {
  const origin = coordsFor(ride.origin_neighborhood, ride.origin_lat, ride.origin_lng);
  const destination = coordsFor(
    ride.destination_neighborhood,
    ride.destination_lat,
    ride.destination_lng,
  );
  const driver =
    typeof ride.driver_lat === "number" && typeof ride.driver_lng === "number"
      ? ([ride.driver_lat, ride.driver_lng] as [number, number])
      : null;

  const shareLink = () => {
    const url = `${window.location.origin}/acompanhar/${ride.share_token}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link de acompanhamento copiado."))
      .catch(() => toast.error("Não foi possível copiar o link."));
  };

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-semibold">{ride.pet_name}</p>
          <span
            className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusStyles[ride.status])}
          >
            {statusLabels[ride.status]}
          </span>
        </div>

        <RideMap origin={origin} destination={destination} driver={driver} />

        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary-ink" /> {ride.origin_address}
          </p>
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-accent" /> {ride.destination_address}
          </p>
          <p>Tempo estimado: {estimateMinutes(Number(ride.distance_km))} min</p>
          <p>
            Posição atualizada:{" "}
            {ride.location_updated_at ? formatDateTime(ride.location_updated_at) : "aguardando GPS"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={shareLink}>
            <Share2 className="size-4" /> Copiar link de acompanhamento
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/acompanhar/$token" params={{ token: ride.share_token }}>
              Abrir página pública
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DriverGpsPanel({ rides }: { rides: LiveRide[] }) {
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const ridesRef = useRef(rides);
  ridesRef.current = rides;

  useEffect(
    () => () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    },
    [],
  );

  const stop = () => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setSharing(false);
  };

  const start = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Este dispositivo não permite acesso ao GPS.");
      return;
    }
    if (ridesRef.current.length === 0) {
      toast.error("Aceite uma corrida antes de compartilhar sua posição.");
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const payload = {
          driver_lat: pos.coords.latitude,
          driver_lng: pos.coords.longitude,
          location_updated_at: new Date().toISOString(),
        };
        for (const ride of ridesRef.current) {
          await supabase.from("rides").update(payload).eq("id", ride.id);
        }
        setLastSent(new Date().toISOString());
      },
      () => {
        toast.error("Não conseguimos acessar o GPS. Verifique a permissão de localização.");
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    setSharing(true);
  };

  return (
    <Card className="border-primary/40 bg-primary/5 shadow-soft">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary-ink">
            {sharing ? <Radio className="size-5 animate-pulse" /> : <Navigation className="size-5" />}
          </span>
          <div>
            <p className="font-semibold">
              {sharing ? "Compartilhando posição ao vivo" : "GPS desligado"}
            </p>
            <p className="text-sm text-muted-foreground">
              {sharing
                ? `Última posição enviada: ${lastSent ? formatDateTime(lastSent) : "aguardando…"}`
                : "Ligue para que o tutor veja o trajeto em tempo real."}
            </p>
          </div>
        </div>
        <Button onClick={sharing ? stop : start} variant={sharing ? "outline" : "default"}>
          {sharing ? "Parar compartilhamento" : "Compartilhar minha posição"}
        </Button>
      </CardContent>
    </Card>
  );
}
