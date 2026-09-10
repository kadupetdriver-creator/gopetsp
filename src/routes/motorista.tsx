import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Car, CheckCircle2, MapPin, Route as RouteIcon, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { releaseRidePayment } from "@/lib/payments.functions";
import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  coordsFor,
  estimateMinutes,
  formatBRL,
  formatDateTime,
  isActiveStatus,
  petSizes,
  serviceTypes,
  statusLabels,
  statusStyles,
  type RideStatus,
} from "@/lib/rides";
import { RideMap } from "@/components/RideMap";
import { cn } from "@/lib/utils";
import { PetDetails, type PetInfo } from "@/components/PetDetails";
import { StatusCard } from "@/routes/seja-motorista";
import type { DriverStatus } from "@/lib/drivers";

export const Route = createFileRoute("/motorista")({
  head: () => ({
    meta: [
      { title: "Painel do motorista parceiro | GoPet" },
      {
        name: "description",
        content:
          "Veja chamadas abertas de transporte de pets em São Paulo, aceite corridas e atualize o status da viagem em tempo real.",
      },
      { property: "og:title", content: "Painel do motorista parceiro | GoPet" },
      {
        property: "og:description",
        content: "Chamadas abertas e corridas aceitas para motoristas parceiros GoPet.",
      },
    ],
  }),
  component: MotoristaPage,
});

type Ride = {
  id: string;
  pet_name: string;
  pet_size: string;
  service_type: string;
  origin_address: string;
  origin_neighborhood: string | null;
  destination_address: string;
  destination_neighborhood: string | null;
  scheduled_at: string;
  notes: string | null;
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
  ride_pets: { pets: PetInfo | null }[] | null;
};

const selectCols =
  "id, pet_name, pet_size, service_type, origin_address, origin_neighborhood, destination_address, destination_neighborhood, scheduled_at, notes, price_cents, distance_km, status, driver_id, needs_trunk, driver_lat, driver_lng, location_updated_at, origin_lat, origin_lng, destination_lat, destination_lng, ride_pets(pets(name, species, breed, size, temperament, weight_kg, health_notes, transport_items, photo_url))";

type Application = {
  id: string;
  status: DriverStatus;
  rejection_reason: string | null;
  vehicles: VehicleInfo[] | null;
};

type VehicleInfo = {
  plate: string;
  model: string;
  brand: string;
  year: number;
  color: string;
  vehicle_type: string;
};

function MotoristaPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Cadastro de motorista: define o status de aprovação e traz o veículo cadastrado.
  const { data: application, isLoading: appLoading } = useQuery({
    queryKey: ["driver-application", user?.id, "panel"],
    enabled: !!user && !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, status, rejection_reason, vehicles(plate, model, brand, year, color, vehicle_type)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Application | null) ?? null;
    },
  });

  const approved = profile?.role === "driver" && application?.status === "aprovado";

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", search: { papel: "motorista" } });
    // Tutor sem solicitação de motorista não tem nada a ver aqui: volta para a tela do tutor.
    if (!loading && profile && profile.role !== "driver" && !appLoading && application === null) {
      void navigate({ to: "/solicitar", replace: true });
    }
  }, [loading, user, profile, appLoading, application, navigate]);

  const { data: rides, isLoading } = useQuery({
    queryKey: ["rides", "driver", user?.id],
    enabled: !!user && approved,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select(selectCols)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Ride[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("rides-driver")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => {
        void qc.invalidateQueries({ queryKey: ["rides"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RideStatus }) => {
      // Aceite e mudança de status são validados no backend (transições e disputa).
      const { error } =
        status === "accepted"
          ? await supabase.rpc("accept_ride", { _ride_id: id })
          : await supabase.rpc("set_ride_status", { _ride_id: id, _status: status });
      if (error) throw error;
      if (status === "completed") {
        const result = await releaseRidePayment({ data: { rideId: id } });
        if ("error" in result) throw new Error(result.error);
      }
    },
    onSuccess: () => {
      toast.success("Corrida atualizada.");
      void qc.invalidateQueries({ queryKey: ["rides"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível atualizar a corrida.",
      ),
  });


  const open = rides?.filter((r) => r.status === "pending") ?? [];

  // Alerta de nova chamada: tela chamativa + vibração quando surge corrida nova.
  const [newRide, setNewRide] = useState<Ride | null>(null);
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!rides) return;
    const ids = open.map((r) => r.id);
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }
    const fresh = open.filter((r) => !seenRef.current!.has(r.id));
    seenRef.current = new Set(ids);
    if (fresh.length === 0) return;
    setNewRide(fresh[0] ?? null);
    try {
      navigator.vibrate?.([400, 150, 400, 150, 600]);
    } catch {
      /* dispositivo sem vibração */
    }
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0.15;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
        osc.onended = () => void ctx.close();
      }
    } catch {
      /* som bloqueado pelo navegador */
    }
  }, [rides, open]);

  const mine = rides?.filter((r) => r.driver_id === user?.id && r.status !== "pending") ?? [];
  const active = mine.filter((r) => r.status !== "completed" && r.status !== "cancelled");
  const completed = mine.filter((r) => r.status === "completed");
  // Ganhos líquidos: o motorista recebe 80% (a plataforma retém 20% de comissão).
  const netOf = (r: Ride) => Math.round(r.price_cents * 0.8);
  const earnings = completed.reduce((sum, r) => sum + netOf(r), 0);
  const now = new Date();
  const thisMonth = completed.filter((r) => {
    const d = new Date(r.scheduled_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthEarnings = thisMonth.reduce((sum, r) => sum + netOf(r), 0);
  const kmTotal = completed.reduce((sum, r) => sum + Number(r.distance_km ?? 0), 0);
  const vehicle = application?.vehicles?.[0] ?? null;

  if (loading || !user || !profile || appLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  // Cadastro ainda não aprovado (ou suspenso): só a tela de status, sem acesso a corridas.
  if (!approved) {
    if (!application) return null;
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-semibold">Painel do motorista</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          As chamadas ficam disponíveis assim que seu cadastro for aprovado.
        </p>
        <div className="mt-6">
          <StatusCard driver={application} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Painel do motorista</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Chamadas de transporte de pets em São Paulo, atualizadas em tempo real.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={RouteIcon} label="Chamadas abertas" value={String(open.length)} />
        <StatCard icon={CalendarClock} label="Minhas corridas" value={String(mine.length)} />
        <StatCard icon={Wallet} label="Ganhos concluídos" value={formatBRL(earnings)} />
      </div>

      <Tabs defaultValue="abertas" className="mt-8">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="abertas">Chamadas abertas</TabsTrigger>
          <TabsTrigger value="minhas">Minhas corridas</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="veiculo">Meu veículo</TabsTrigger>
        </TabsList>

        <TabsContent value="abertas" className="mt-5 space-y-4">
          {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
          {!isLoading && open.length === 0 && (
            <EmptyState text="Nenhuma chamada aberta agora. Deixe a página aberta — avisamos assim que aparecer." />
          )}
          {open.map((ride) => (
            <RideCard key={ride.id} ride={ride}>
              <Button
                onClick={() => update.mutate({ id: ride.id, status: "accepted" })}
                disabled={update.isPending}
              >
                Aceitar chamada
              </Button>
            </RideCard>
          ))}
        </TabsContent>

        <TabsContent value="minhas" className="mt-5 space-y-4">
          {active.length === 0 && (
            <EmptyState text="Nenhuma corrida em andamento. As concluídas ficam em Relatórios." />
          )}
          {active.map((ride) => (
            <RideCard key={ride.id} ride={ride} showMap>
              {ride.status === "accepted" && (
                <Button
                  onClick={() => update.mutate({ id: ride.id, status: "in_progress" })}
                  disabled={update.isPending}
                >
                  Iniciar transporte
                </Button>
              )}
              {ride.status === "in_progress" && (
                <Button
                  onClick={() => update.mutate({ id: ride.id, status: "completed" })}
                  disabled={update.isPending}
                >
                  Finalizar corrida
                </Button>
              )}
            </RideCard>
          ))}
        </TabsContent>

        <TabsContent value="relatorios" className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={CheckCircle2} label="Corridas realizadas" value={String(completed.length)} />
            <StatCard icon={Wallet} label="Ganhos neste mês" value={formatBRL(monthEarnings)} />
            <StatCard icon={RouteIcon} label="Km percorridos" value={`${kmTotal.toFixed(1)} km`} />
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Histórico</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/pagamentos">Ver repasses</Link>
            </Button>
          </div>
          {mine.filter((r) => r.status === "completed" || r.status === "cancelled").length === 0 && (
            <EmptyState text="Suas corridas concluídas aparecerão aqui." />
          )}
          <div className="space-y-2">
            {mine
              .filter((r) => r.status === "completed" || r.status === "cancelled")
              .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
              .map((ride) => (
                <Card key={ride.id} className="shadow-soft">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
                    <div>
                      <p className="font-semibold">
                        {ride.pet_name}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {formatDateTime(ride.scheduled_at)}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        {ride.origin_address} → {ride.destination_address}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          statusStyles[ride.status],
                        )}
                      >
                        {statusLabels[ride.status]}
                      </span>
                      <span className="font-semibold">
                        {ride.status === "completed" ? formatBRL(netOf(ride)) : "—"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="veiculo" className="mt-5">
          {vehicle ? (
            <Card className="shadow-soft">
              <CardContent className="py-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
                    <Car className="size-5" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold">
                      {vehicle.brand} {vehicle.model}
                    </p>
                    <p className="text-sm text-muted-foreground">Placa {vehicle.plate}</p>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Ano</dt>
                    <dd className="font-medium">{vehicle.year}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Cor</dt>
                    <dd className="font-medium">{vehicle.color}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</dt>
                    <dd className="font-medium capitalize">{vehicle.vehicle_type}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Placa</dt>
                    <dd className="font-medium">{vehicle.plate}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-xs text-muted-foreground">
                  Precisa trocar de veículo? Fale com o suporte GoPet pelo WhatsApp para atualizar o
                  cadastro.
                </p>
              </CardContent>
            </Card>
          ) : (
            <EmptyState text="Nenhum veículo encontrado no seu cadastro." />
          )}
        </TabsContent>
      </Tabs>

      {newRide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-pulse-none rounded-3xl border-4 border-primary bg-primary p-6 text-primary-foreground shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em]">Nova chamada</p>
            <p className="mt-2 text-2xl font-extrabold">
              {newRide.pet_name} · {formatBRL(newRide.price_cents)}
            </p>
            <p className="mt-3 text-sm font-medium">
              Embarque: {newRide.origin_address}
              {newRide.origin_neighborhood ? ` · ${newRide.origin_neighborhood}` : ""}
            </p>
            <p className="mt-1 text-sm font-medium">
              Destino: {newRide.destination_address}
              {newRide.destination_neighborhood ? ` · ${newRide.destination_neighborhood}` : ""}
            </p>
            <p className="mt-1 text-sm">
              {formatDateTime(newRide.scheduled_at)} · {newRide.distance_km} km
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={update.isPending}
                onClick={() => {
                  update.mutate({ id: newRide.id, status: "accepted" });
                  setNewRide(null);
                }}
              >
                Aceitar agora
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setNewRide(null)}>
                Ver depois
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <Card className="shadow-soft">
      <CardContent className="flex items-center gap-3 py-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

function RideCard({
  ride,
  children,
  showMap = false,
}: {
  ride: Ride;
  children?: React.ReactNode;
  showMap?: boolean;
}) {
  return (
    <Card
      className={cn(
        "shadow-soft transition-colors",
        showMap && isActiveStatus(ride.status) && "border-primary/50 bg-primary/10",
      )}
    >
      <CardContent className="space-y-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">
              {ride.pet_name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                · {petSizes.find((s) => s.value === ride.pet_size)?.label}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {serviceTypes.find((s) => s.value === ride.service_type)?.label ?? "Transporte"}
            </p>
          </div>
          <span
            className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusStyles[ride.status])}
          >
            {statusLabels[ride.status]}
          </span>
        </div>

        {showMap && isActiveStatus(ride.status) && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Rastreio ao vivo
              <span className="ml-2 font-normal text-muted-foreground">
                trajeto estimado em {estimateMinutes(Number(ride.distance_km))} min
              </span>
            </p>
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
            <p className="text-xs text-muted-foreground">
              Sua posição é enviada automaticamente enquanto a corrida estiver ativa. Última
              atualização:{" "}
              {ride.location_updated_at
                ? formatDateTime(ride.location_updated_at)
                : "aguardando sinal de GPS"}
            </p>
          </div>
        )}

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

        {(() => {
          const pets = (ride.ride_pets ?? [])
            .map((rp) => rp.pets)
            .filter((p): p is PetInfo => !!p);
          if (pets.length === 0) return null;
          return (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {pets.length > 1 ? `${pets.length} pets nesta corrida` : "Pet desta corrida"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {pets.map((pet) => (
                  <PetDetails key={pet.name} pet={pet} />
                ))}
              </div>
            </div>
          );
        })()}

        {ride.notes && (
          <p className="rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
            “{ride.notes}”
          </p>
        )}

        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </CardContent>
    </Card>
  );
}
