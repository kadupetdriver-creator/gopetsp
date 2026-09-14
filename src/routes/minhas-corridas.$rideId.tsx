import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  MapPin,
  MessageCircle,
  Navigation,
  PawPrint,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RideMap } from "@/components/RideMap";
import { RideChat } from "@/components/RideChat";
import {
  coordsFor,
  estimateMinutes,
  formatBRL,
  formatDateTime,
  isActiveStatus,
  labelOf,
  petSizes,
  petSpecies,
  rideWhatsAppUrl,
  serviceTypes,
  statusLabels,
  statusStyles,
  type RideStatus,
} from "@/lib/rides";
import { cn } from "@/lib/utils";
import { paymentStatusLabels, paymentStatusStyles, getStripeEnvironment } from "@/lib/stripe";
import { refundRidePayment } from "@/lib/payments.functions";

export const Route = createFileRoute("/minhas-corridas/$rideId")({
  head: () => ({
    meta: [
      { title: "Detalhes da corrida | GoPet" },
      {
        name: "description",
        content: "Acompanhe todos os detalhes e a localização ao vivo da corrida do seu pet.",
      },
      { property: "og:title", content: "Detalhes da corrida | GoPet" },
      { property: "og:description", content: "Detalhes e localização ao vivo da corrida do seu pet." },
    ],
  }),
  component: RideDetails,
});

type Stop = { address: string; lat: number; lng: number };

type Ride = {
  id: string;
  tutor_id: string;
  pet_name: string;
  service_type: string;
  origin_address: string;
  origin_neighborhood: string | null;
  destination_address: string;
  destination_neighborhood: string | null;
  scheduled_at: string;
  price_cents: number;
  distance_km: number;
  status: RideStatus;
  driver_id: string | null;
  needs_trunk: boolean;
  driver_lat: number | null;
  driver_lng: number | null;
  location_updated_at: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  stops: Stop[] | null;
  notes: string | null;
};

const RIDE_SELECT =
  "id, tutor_id, pet_name, service_type, origin_address, origin_neighborhood, destination_address, destination_neighborhood, scheduled_at, price_cents, distance_km, status, driver_id, needs_trunk, driver_lat, driver_lng, location_updated_at, origin_lat, origin_lng, destination_lat, destination_lng, stops, notes";

function RideDetails() {
  const { rideId } = Route.useParams();
  const { user } = useRoleGuard("tutor", "/minhas-corridas");
  const qc = useQueryClient();

  const { data: ride, isLoading } = useQuery({
    queryKey: ["ride", rideId],
    enabled: !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select(RIDE_SELECT)
        .eq("id", rideId)
        .eq("tutor_id", user!.id)
        .single();
      if (error) throw error;
      return data as Ride;
    },
  });

  const { data: payment } = useQuery({
    queryKey: ["ride-payment", rideId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_payments")
        .select("status")
        .eq("ride_id", rideId)
        .maybeSingle();
      if (error) throw error;
      return data as { status: string } | null;
    },
  });

  const { data: pets } = useQuery({
    queryKey: ["ride-pets", rideId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_pets")
        .select("pet_id, pets(name, species, size)")
        .eq("ride_id", rideId);
      if (error) throw error;
      return (data ?? []) as {
        pet_id: string;
        pets: { name: string; species: string; size: string } | null;
      }[];
    },
  });

  const { data: driver } = useQuery({
    queryKey: ["ride-driver", ride?.driver_id],
    enabled: !!ride?.driver_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", ride!.driver_id!)
        .maybeSingle();
      if (error) throw error;
      return data as { full_name: string | null; phone: string | null } | null;
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`ride-detail-${rideId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        () => void qc.invalidateQueries({ queryKey: ["ride", rideId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, qc, rideId]);

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_ride_status", {
        _ride_id: rideId,
        _status: "cancelled",
      });
      if (error) throw error;
      const result = await refundRidePayment({
        data: { rideId, environment: getStripeEnvironment() },
      });
      if ("error" in result) throw new Error(result.error);
      return result.status;
    },
    onSuccess: (status) => {
      toast.success(
        status === "refunded"
          ? "Corrida cancelada. O estorno foi solicitado."
          : "Corrida cancelada.",
      );
      void qc.invalidateQueries({ queryKey: ["ride", rideId] });
    },
    onError: () => toast.error("Não foi possível cancelar."),
  });

  if (isLoading || !ride) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const paymentStatus = payment?.status ?? "pending";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 rounded-full">
        <Link to="/minhas-corridas">
          <ArrowLeft className="mr-1 size-4" /> Minhas corridas
        </Link>
      </Button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{ride.pet_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {serviceTypes.find((s) => s.value === ride.service_type)?.label ?? "Transporte"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusStyles[ride.status])}
          >
            {statusLabels[ride.status]}
          </span>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              paymentStatusStyles[paymentStatus],
            )}
          >
            {paymentStatusLabels[paymentStatus]}
          </span>
        </div>
      </div>

      {isActiveStatus(ride.status) && (
        <Alert variant="warning" className="mt-6 rounded-2xl">
          <AlertTriangle className="size-5 shrink-0" />
          <AlertTitle>Importante sobre o embarque</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>Qualquer cancelamento acarretará na retenção de 20% do valor da corrida.</p>
            <p>
              Caso o cancelamento seja realizado com o motorista na porta da residência, o valor
              retido será de 100%.
            </p>
            <p>O tutor deverá aguardar o motorista na portaria ou na entrada da residência.</p>
            <p>
              O motorista deverá aguardar, no máximo, 10 minutos. Após esse período, a viagem será
              cancelada e o valor retido será de 100%.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Card className="mt-6 shadow-soft">
        <CardContent className="space-y-4 py-6">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Navigation className="size-4 text-primary-ink" />
              Localização
              {isActiveStatus(ride.status) && (
                <span className="font-normal text-muted-foreground">
                  · chegada estimada em {estimateMinutes(Number(ride.distance_km))} min
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {ride.location_updated_at
                ? `Atualizada: ${formatDateTime(ride.location_updated_at)}`
                : "Aguardando sinal do motorista"}
            </p>
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
          />
        </CardContent>
      </Card>

      <Card className="mt-4 shadow-soft">
        <CardContent className="space-y-3 py-6 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary-ink" />
            <span>
              <strong className="font-medium text-foreground">Embarque:</strong>{" "}
              {ride.origin_address}
              {ride.origin_neighborhood ? ` · ${ride.origin_neighborhood}` : ""}
            </span>
          </p>
          {ride.stops?.map((stop, i) => (
            <p key={i} className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <strong className="font-medium text-foreground">Parada {i + 1}:</strong>{" "}
                {stop.address}
              </span>
            </p>
          ))}
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              <strong className="font-medium text-foreground">Destino:</strong>{" "}
              {ride.destination_address}
              {ride.destination_neighborhood ? ` · ${ride.destination_neighborhood}` : ""}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-primary-ink" />
            {formatDateTime(ride.scheduled_at)}
          </p>
          <p className="font-semibold text-foreground">
            {formatBRL(ride.price_cents)}{" "}
            <span className="font-normal text-muted-foreground">· {ride.distance_km} km</span>
            {ride.needs_trunk && (
              <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                Porta-malas
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4 shadow-soft">
        <CardContent className="space-y-3 py-6">
          <p className="flex items-center gap-2 text-sm font-medium">
            <PawPrint className="size-4 text-primary-ink" /> Pets nesta corrida
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {(pets?.length
              ? pets
              : [{ pet_id: "legacy", pets: null }]
            ).map((rp) => (
              <li key={rp.pet_id} className="font-medium text-foreground">
                {rp.pets?.name ?? ride.pet_name}
                {rp.pets && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {labelOf(petSpecies, rp.pets.species)} · {labelOf(petSizes, rp.pets.size)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {driver && (
            <p className="text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">Motorista:</strong>{" "}
              {driver.full_name ?? "Parceiro GoPet"}
              {driver.phone ? ` · ${driver.phone}` : ""}
            </p>
          )}
          {ride.notes && (
            <p className="text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">Observações:</strong> {ride.notes}
            </p>
          )}
        </CardContent>
      </Card>

      {isActiveStatus(ride.status) && user && (
        <div className="mt-4">
          <RideChat
            rideId={ride.id}
            userId={user.id}
            active
            counterpartName={driver?.full_name ?? "Motorista"}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {paymentStatus === "pending" && ride.status !== "cancelled" && (
          <Button asChild className="rounded-full">
            <Link to="/pagamento/$rideId" params={{ rideId: ride.id }}>
              Pagar corrida
            </Link>
          </Button>
        )}
        {ride.status !== "cancelled" && (
          <Button asChild variant="secondary" className="rounded-full">
            <a href={rideWhatsAppUrl(ride)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 size-4" />
              Enviar para a central
            </a>
          </Button>
        )}
        {(ride.status === "pending" || ride.status === "accepted") && (
          <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancelar corrida
          </Button>
        )}
      </div>
    </div>
  );
}
