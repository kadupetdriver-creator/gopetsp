import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MapPin, Route as RouteIcon, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatBRL,
  formatDateTime,
  petSizes,
  serviceTypes,
  statusLabels,
  statusStyles,
  type RideStatus,
} from "@/lib/rides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/motorista")({
  head: () => ({
    meta: [
      { title: "Painel do motorista parceiro | PetMobi" },
      {
        name: "description",
        content:
          "Veja chamadas abertas de transporte de pets em São Paulo, aceite corridas e atualize o status da viagem em tempo real.",
      },
      { property: "og:title", content: "Painel do motorista parceiro | PetMobi" },
      {
        property: "og:description",
        content: "Chamadas abertas e corridas aceitas para motoristas parceiros PetMobi.",
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
};

const selectCols =
  "id, pet_name, pet_size, service_type, origin_address, origin_neighborhood, destination_address, destination_neighborhood, scheduled_at, notes, price_cents, distance_km, status, driver_id";

function MotoristaPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
    if (!loading && profile && profile.role !== "driver") void navigate({ to: "/solicitar" });
  }, [loading, user, profile, navigate]);

  const { data: rides, isLoading } = useQuery({
    queryKey: ["rides", "driver", user?.id],
    enabled: !!user && profile?.role === "driver",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select(selectCols)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as Ride[];
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
      const { error } = await supabase
        .from("rides")
        .update({ status, driver_id: user!.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corrida atualizada.");
      void qc.invalidateQueries({ queryKey: ["rides"] });
    },
    onError: () => toast.error("Não foi possível atualizar a corrida."),
  });

  const open = rides?.filter((r) => r.status === "pending") ?? [];
  const mine = rides?.filter((r) => r.driver_id === user?.id && r.status !== "pending") ?? [];
  const earnings = mine
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + r.price_cents, 0);

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
        <TabsList>
          <TabsTrigger value="abertas">Chamadas abertas</TabsTrigger>
          <TabsTrigger value="minhas">Minhas corridas</TabsTrigger>
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
          {mine.length === 0 && <EmptyState text="Você ainda não aceitou nenhuma corrida." />}
          {mine.map((ride) => (
            <RideCard key={ride.id} ride={ride}>
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
      </Tabs>
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

function RideCard({ ride, children }: { ride: Ride; children?: React.ReactNode }) {
  return (
    <Card className="shadow-soft">
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
          </p>
        </div>

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
