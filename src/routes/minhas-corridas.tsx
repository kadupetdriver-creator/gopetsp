import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MapPin, MessageCircle, PawPrint } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatBRL,
  formatDateTime,
  serviceTypes,
  rideWhatsAppUrl,
  statusLabels,
  statusStyles,
  type RideStatus,
} from "@/lib/rides";
import { cn } from "@/lib/utils";
import { paymentStatusLabels, paymentStatusStyles, getStripeEnvironment } from "@/lib/stripe";
import { refundRidePayment } from "@/lib/payments.functions";

export const Route = createFileRoute("/minhas-corridas")({
  head: () => ({
    meta: [
      { title: "Minhas corridas pet | GoPet" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real o status das corridas do seu pet em São Paulo: motorista a caminho, em transporte e concluída.",
      },
      { property: "og:title", content: "Minhas corridas pet | GoPet" },
      {
        property: "og:description",
        content: "Status ao vivo das viagens do seu pet com a GoPet.",
      },
    ],
  }),
  component: MinhasCorridas,
});

type Ride = {
  id: string;
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
};

type Payment = { ride_id: string; status: string };

function MinhasCorridas() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: rides, isLoading } = useQuery({
    queryKey: ["rides", "tutor", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select(
          "id, pet_name, service_type, origin_address, origin_neighborhood, destination_address, destination_neighborhood, scheduled_at, price_cents, distance_km, status, driver_id, needs_trunk",
        )
        .eq("tutor_id", user!.id)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data as Ride[];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["ride-payments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_payments")
        .select("ride_id, status")
        .eq("tutor_id", user!.id);
      if (error) throw error;
      return data as Payment[];
    },
  });

  const paymentOf = (rideId: string) => payments?.find((p) => p.ride_id === rideId);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("rides-tutor")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => {
        void qc.invalidateQueries({ queryKey: ["rides"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_payments" }, () => {
        void qc.invalidateQueries({ queryKey: ["ride-payments"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rides").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
      const result = await refundRidePayment({
        data: { rideId: id, environment: getStripeEnvironment() },
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
      void qc.invalidateQueries({ queryKey: ["rides"] });
      void qc.invalidateQueries({ queryKey: ["ride-payments"] });
    },
    onError: () => toast.error("Não foi possível cancelar."),
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Minhas corridas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Atualizações em tempo real de cada trajeto.
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/solicitar">Nova corrida</Link>
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        {isLoading && [1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}

        {!isLoading && rides?.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <PawPrint className="size-8 text-primary-ink" />
              <p className="font-medium">Nenhuma corrida por aqui ainda</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Solicite o primeiro transporte e acompanhe o motorista parceiro em tempo real.
              </p>
              <Button asChild className="mt-2 rounded-full">
                <Link to="/solicitar">Solicitar corrida</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {rides?.map((ride) => (
          <Card key={ride.id} className="shadow-soft">
            <CardContent className="space-y-4 py-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{ride.pet_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {serviceTypes.find((s) => s.value === ride.service_type)?.label ?? "Transporte"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    statusStyles[ride.status],
                  )}
                >
                  {statusLabels[ride.status]}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    paymentStatusStyles[paymentOf(ride.id)?.status ?? "pending"],
                  )}
                >
                  {paymentStatusLabels[paymentOf(ride.id)?.status ?? "pending"]}
                </span>
                {(paymentOf(ride.id)?.status ?? "pending") === "pending" &&
                  ride.status !== "cancelled" && (
                    <Button asChild size="sm" className="rounded-full">
                      <Link to="/pagamento/$rideId" params={{ rideId: ride.id }}>
                        Pagar corrida
                      </Link>
                    </Button>
                  )}
              </div>

              <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary-ink" />
                  <span>
                    <strong className="font-medium text-foreground">Embarque:</strong>{" "}
                    {ride.origin_address}
                    {ride.origin_neighborhood ? ` · ${ride.origin_neighborhood}` : ""}
                  </span>
                </p>
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
              </div>

              <div className="flex flex-wrap gap-2">
                {ride.status !== "cancelled" && (
                  <Button asChild variant="secondary" size="sm" className="rounded-full">
                    <a
                      href={rideWhatsAppUrl(ride)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="mr-2 size-4" />
                      Enviar para a central
                    </a>
                  </Button>
                )}
                {(ride.status === "pending" || ride.status === "accepted") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancel.mutate(ride.id)}
                    disabled={cancel.isPending}
                  >
                    Cancelar corrida
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
