import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarClock, CalendarRange, CheckCircle2, MapPin, Route as RouteIcon, Wallet, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { driverShareCents } from "@/lib/pricing";
import { tutorAccompanimentLabel } from "@/lib/ride-accompaniment";
import { rideOccursWithin } from "@/lib/driver-payments";
import { earningsRangeError, matchesEarningsRange } from "@/lib/driver-earnings-range";
import { DriverPaymentStatus, driverPaymentRowClass } from "@/components/DriverPaymentStatus";

import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AddressLink } from "@/components/AddressLink";
import { RideReview } from "@/components/RideReview";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MotoristaPage,
});

type Ride = {
  id: string;
  tutor_id: string;
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
  tutor_accompanies_pet: boolean | null;
  accompanying_people_count: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  location_updated_at: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  arrived_at: string | null;
  paid_at: string | null;
  stops: { address: string; lat: number; lng: number }[] | null;
  ride_pets: { pets: PetInfo | null }[] | null;
  preferred_driver_id: string | null;
  preferred_until: string | null;
};

const selectCols =
  "id, tutor_id, pet_name, pet_size, service_type, origin_address, origin_neighborhood, destination_address, destination_neighborhood, scheduled_at, notes, price_cents, distance_km, status, driver_id, needs_trunk, tutor_accompanies_pet, accompanying_people_count, driver_lat, driver_lng, location_updated_at, origin_lat, origin_lng, destination_lat, destination_lng, arrived_at, paid_at, stops, preferred_driver_id, preferred_until, ride_pets(pets(name, species, breed, size, temperament, weight_kg, health_notes, transport_items, photo_url))";

const driverValueOf = (ride: Pick<Ride, "price_cents">) => driverShareCents(ride.price_cents);

// Períodos semanais de ganhos (horário de São Paulo), iguais aos do painel admin:
// "Ganhos Sexta-Feira" = corridas pagas de segunda a quinta; "Ganhos Segunda-Feira" = sexta a domingo.
const SAO_PAULO_OFFSET_HOURS = 3;

function saoPauloDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: weekdays[value("weekday")] ?? 0,
  };
}

function localDateToUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, SAO_PAULO_OFFSET_HOURS, 0, 0, 0));
}

function addCalendarDays(date: Date, days: number, endOfDay = false) {
  const shifted = new Date(date.getTime() + days * 86_400_000);
  return endOfDay ? new Date(shifted.getTime() + 86_400_000 - 1) : shifted;
}

function latestCompletedEarningsPeriods(now = new Date()) {
  const parts = saoPauloDateParts(now);
  const todayStart = localDateToUtc(parts.year, parts.month, parts.day);
  const daysSinceMonday = (parts.weekday + 6) % 7;
  const thisMonday = addCalendarDays(todayStart, -daysSinceMonday);

  const fridayBase = parts.weekday >= 5 ? thisMonday : addCalendarDays(thisMonday, -7);
  const mondayBase = addCalendarDays(thisMonday, -3);

  return {
    friday: {
      title: "Ganhos Sexta-Feira",
      subtitle: "Corridas pagas de segunda a quinta-feira",
      start: fridayBase,
      end: addCalendarDays(fridayBase, 3, true),
    },
    monday: {
      title: "Ganhos Segunda-Feira",
      subtitle: "Corridas pagas de sexta-feira a domingo",
      start: mondayBase,
      end: addCalendarDays(mondayBase, 2, true),
    },
  };
}

function paidWithin(rides: Ride[], start: Date, end: Date) {
  return rides.filter((ride) => {
    if (!ride.paid_at) return false;
    return rideOccursWithin(ride.scheduled_at, start, end);
  });
}

function formatSaoPauloDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

type Application = {
  id: string;
  status: DriverStatus;
  rejection_reason: string | null;
  // O vínculo é 1:1, então o embed pode voltar como objeto ou lista.
  vehicles: VehicleInfo | VehicleInfo[] | null;
};

type VehicleInfo = {
  plate: string;
  model: string;
  brand: string;
  year: number;
  color: string;
  vehicle_type: string;
  is_active?: boolean;
};

function MotoristaPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [earningsStart, setEarningsStart] = useState("");
  const [earningsEnd, setEarningsEnd] = useState("");

  // Cadastro de motorista: define o status de aprovação e traz o veículo cadastrado.
  const { data: application, isLoading: appLoading } = useQuery({
    queryKey: ["driver-application", user?.id, "panel"],
    enabled: !!user && !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, status, rejection_reason, vehicles(plate, model, brand, year, color, vehicle_type, is_active)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Application | null) ?? null;
    },
  });

  const approved = profile?.role === "driver" && application?.status === "aprovado";
  const { data: driverPayments } = useQuery({
    queryKey: ["driver-ride-payments", user?.id],
    enabled: Boolean(user && approved),
    refetchInterval: 15000,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("driver_ride_payments").select("ride_id, paid_at, amount_cents").eq("driver_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const paymentsByRide = Object.fromEntries((driverPayments ?? []).map((p) => [p.ride_id, p.paid_at]));

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", search: { papel: "motorista" } });
    // Tutor sem solicitação de motorista não tem nada a ver aqui: volta para a tela do tutor.
    if (!loading && profile && profile.role !== "driver" && !appLoading && application === null) {
      void navigate({ to: "/solicitar", replace: true });
    }
  }, [loading, user, profile, appLoading, application, navigate]);

  // Bônus do próprio motorista (as regras de acesso só devolvem os lançamentos dele).
  const { data: bonuses } = useQuery({
    queryKey: ["driver-bonuses", user?.id],
    enabled: !!user && approved,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id, amount_cents, description, completed_at, created_at")
        .eq("user_id", user!.id)
        .eq("payment_method", "bonus")
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DriverBonus[];
    },
  });

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

  const assignedRideIds = (rides ?? [])
    .filter((ride) => ride.driver_id === user?.id)
    .map((ride) => ride.id)
    .sort();
  const { data: tutorNames = {} } = useQuery({
    queryKey: ["ride-tutor-names", user?.id, assignedRideIds],
    enabled: !!user && approved && assignedRideIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ride_tutor_names", {
        _ride_ids: assignedRideIds,
      });
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row) => [row.ride_id, row.full_name]));
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

  // Guarda qual corrida do bolsão está sendo aceita, para travar só aquele botão.
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RideStatus }) => {
      // Aceite e mudança de status são validados no backend (transições e disputa).
      const { error } =
        status === "accepted"
          ? await supabase.rpc("accept_ride", { _ride_id: id })
          : await supabase.rpc("set_ride_status", { _ride_id: id, _status: status });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.status === "accepted" ? "Corrida sua! Já está em Minhas corridas." : "Corrida atualizada.",
      );
      void qc.invalidateQueries({ queryKey: ["rides"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível atualizar a corrida.",
      );
      // Se outro motorista pegou primeiro, o bolsão é atualizado na hora.
      void qc.invalidateQueries({ queryKey: ["rides"] });
    },
    onSettled: () => setAcceptingId(null),
  });


  // "Cheguei": registra o horário de chegada e avisa o tutor em tempo real.
  const arrive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("mark_driver_arrived", { _ride_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tutor avisado de que você chegou.");
      void qc.invalidateQueries({ queryKey: ["rides"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível avisar a chegada.",
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
  const earnings = completed.reduce((sum, r) => sum + driverValueOf(r), 0);
  const now = new Date();
  const thisMonth = completed.filter((r) => {
    const d = new Date(r.scheduled_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthEarnings = thisMonth.reduce((sum, r) => sum + driverValueOf(r), 0);
  const bonusTotal = (bonuses ?? []).reduce((sum, b) => sum + b.amount_cents, 0);
  const monthBonus = (bonuses ?? [])
    .filter((b) => {
      const d = new Date(b.completed_at ?? b.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, b) => sum + b.amount_cents, 0);
  const kmTotal = completed.reduce((sum, r) => sum + Number(r.distance_km ?? 0), 0);
  const rangeActive = Boolean(earningsStart || earningsEnd);
  const rangeError = earningsRangeError(earningsStart, earningsEnd);
  const rangeCompleted = completed.filter((r) => matchesEarningsRange(r.scheduled_at, earningsStart, earningsEnd));
  const rangeBonuses = (bonuses ?? []).filter((b) => matchesEarningsRange(b.completed_at ?? b.created_at, earningsStart, earningsEnd));
  const rangeTotal = rangeCompleted.reduce((sum, r) => sum + driverValueOf(r), 0)
    + rangeBonuses.reduce((sum, b) => sum + b.amount_cents, 0);
  const rangeKm = rangeCompleted.reduce((sum, r) => sum + Number(r.distance_km ?? 0), 0);
  const history = mine.filter((r) => (r.status === "completed" || r.status === "cancelled")
    && matchesEarningsRange(r.scheduled_at, earningsStart, earningsEnd))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  // Relatórios semanais: só corridas do próprio motorista (a consulta já vem filtrada pelas regras de acesso).
  const earningsPeriods = latestCompletedEarningsPeriods();
  const fridayEarnings = paidWithin(completed, earningsPeriods.friday.start, earningsPeriods.friday.end);
  const mondayEarnings = paidWithin(completed, earningsPeriods.monday.start, earningsPeriods.monday.end);
  const rawVehicles = application?.vehicles ?? null;
  const vehicle = (Array.isArray(rawVehicles) ? (rawVehicles.find((v) => v.is_active) ?? rawVehicles[0] ?? null) : rawVehicles) ?? null;

  // Lembrete: avisa o motorista 30 minutos antes do horário de cada corrida aceita.
  const [tick, setTick] = useState(0);
  const remindedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  const upcoming = active.filter((r) => {
    if (r.status === "in_progress") return false;
    const diff = new Date(r.scheduled_at).getTime() - Date.now();
    return diff > 0 && diff <= 30 * 60 * 1000;
  });

  useEffect(() => {
    for (const ride of upcoming) {
      if (remindedRef.current.has(ride.id)) continue;
      remindedRef.current.add(ride.id);
      const minutes = Math.max(
        1,
        Math.round((new Date(ride.scheduled_at).getTime() - Date.now()) / 60000),
      );
      toast.warning(`Sua corrida começa em ${minutes} min`, {
        description: `${ride.pet_name} · ${ride.origin_address}`,
        duration: 15000,
      });
      try {
        navigator.vibrate?.([300, 120, 300]);
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
          osc.frequency.value = 660;
          gain.gain.value = 0.15;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.5);
          osc.onended = () => void ctx.close();
        }
      } catch {
        /* som bloqueado pelo navegador */
      }
    }
    // tick força a reavaliação periódica dos horários
  }, [upcoming, tick]);

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

      {upcoming.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <BellRing className="size-5" /> Corrida em menos de 30 minutos
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {upcoming.map((r) => (
              <li key={r.id}>
                {formatDateTime(r.scheduled_at)} · {r.pet_name} · {r.origin_address}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <StatCard icon={Wallet} label="Ganhos concluídos (com bônus)" value={formatBRL(earnings + bonusTotal)} />
      </div>

      <Tabs defaultValue="abertas" className="mt-8">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="abertas">Bolsão de corridas ({open.length})</TabsTrigger>
          <TabsTrigger value="minhas">Minhas corridas ({active.length})</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="abertas" className="mt-5 space-y-4">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="flex items-center gap-2 font-semibold">
              <RouteIcon className="size-5 text-primary-ink" />
              Corridas disponíveis ({open.length})
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Todas as corridas pagas e sem motorista aparecem aqui. Cada corrida vai para um único
              motorista: o primeiro que aceitar fica com ela e a chamada some para os demais.
            </p>
          </div>
          {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
          {!isLoading && open.length === 0 && (
            <EmptyState text="Nenhuma corrida disponível agora. Deixe a página aberta — avisamos assim que aparecer." />
          )}
          {open.map((ride) => (
            <RideCard key={ride.id} ride={ride}>
              {ride.preferred_driver_id === user.id &&
                !!ride.preferred_until &&
                new Date(ride.preferred_until).getTime() > Date.now() && (
                  <span className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary-ink">
                    Preferência do tutor
                  </span>
                )}
              <Button
                onClick={() => {
                  setAcceptingId(ride.id);
                  update.mutate({ id: ride.id, status: "accepted" });
                }}
                disabled={update.isPending}
              >
                {acceptingId === ride.id ? "Aceitando…" : "Aceitar chamada"}
              </Button>
            </RideCard>
          ))}
        </TabsContent>

        <TabsContent value="minhas" className="mt-5 space-y-4">
          {active.length === 0 && (
            <EmptyState text="Nenhuma corrida em andamento. As concluídas ficam em Relatórios." />
          )}
          {active.map((ride) => (
            <RideCard key={ride.id} ride={ride} tutorName={tutorNames[ride.id]} showMap>
              {ride.status === "accepted" && (
                <>
                  <Button
                    onClick={() => update.mutate({ id: ride.id, status: "en_route" })}
                    disabled={update.isPending}
                  >
                    Estou a caminho
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => update.mutate({ id: ride.id, status: "in_progress" })}
                    disabled={update.isPending}
                  >
                    Iniciar transporte
                  </Button>
                </>
              )}
              {ride.status === "en_route" && (
                <>
                  <Button
                    onClick={() => arrive.mutate(ride.id)}
                    disabled={arrive.isPending || !!ride.arrived_at}
                  >
                    {ride.arrived_at ? "Chegada avisada" : "Cheguei"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => update.mutate({ id: ride.id, status: "in_progress" })}
                    disabled={update.isPending}
                  >
                    Iniciar transporte
                  </Button>
                </>
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
          <div className="flex flex-wrap items-end gap-3 border-b border-border pb-5">
            <div className="min-w-0 flex-1 space-y-2 sm:flex-none">
              <Label htmlFor="earnings-start">Data inicial</Label>
              <Input id="earnings-start" type="date" className="w-full min-w-0 sm:w-44" value={earningsStart} onChange={(e) => setEarningsStart(e.target.value)} aria-describedby={rangeError ? "earnings-range-error" : undefined} />
            </div>
            <div className="min-w-0 flex-1 space-y-2 sm:flex-none">
              <Label htmlFor="earnings-end">Data final</Label>
              <Input id="earnings-end" type="date" className="w-full min-w-0 sm:w-44" value={earningsEnd} onChange={(e) => setEarningsEnd(e.target.value)} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? "earnings-range-error" : undefined} />
            </div>
            {rangeActive && <Button variant="ghost" size="icon" aria-label="Limpar datas" title="Limpar datas" onClick={() => { setEarningsStart(""); setEarningsEnd(""); }}><X className="size-4" /></Button>}
            {rangeError && <p id="earnings-range-error" role="alert" className="w-full text-sm text-destructive">{rangeError}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={CheckCircle2} label="Corridas realizadas" value={String(rangeCompleted.length)} />
            <StatCard icon={Wallet} label={rangeActive ? "Ganhos no período (com bônus)" : "Ganhos neste mês (com bônus)"} value={formatBRL(rangeActive ? rangeTotal : monthEarnings + monthBonus)} />
            <StatCard icon={RouteIcon} label="Km percorridos" value={`${(rangeActive ? rangeKm : kmTotal).toFixed(1)} km`} />
          </div>

          {rangeActive ? (
            <DriverEarningsReport period={{ title: "Rendimentos no período", subtitle: "Corridas realizadas e bônus", start: new Date(), end: new Date() }} periodLabel={`${earningsStart ? formatSaoPauloDate(new Date(`${earningsStart}T12:00:00-03:00`)) : "Desde o início"} a ${earningsEnd ? formatSaoPauloDate(new Date(`${earningsEnd}T12:00:00-03:00`)) : "sem data final"}`} rides={rangeCompleted} paymentsByRide={paymentsByRide} tutorNames={tutorNames} bonuses={rangeBonuses} />
          ) : <div className="grid gap-4 lg:grid-cols-2">
            <DriverEarningsReport period={earningsPeriods.friday} rides={fridayEarnings} paymentsByRide={paymentsByRide} tutorNames={tutorNames} bonuses={bonusesWithin(bonuses ?? [], earningsPeriods.friday.start, earningsPeriods.friday.end)} />
            <DriverEarningsReport period={earningsPeriods.monday} rides={mondayEarnings} paymentsByRide={paymentsByRide} tutorNames={tutorNames} bonuses={bonusesWithin(bonuses ?? [], earningsPeriods.monday.start, earningsPeriods.monday.end)} />
          </div>}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Histórico</h2>
          </div>
          {history.length === 0 && (
            <EmptyState text={rangeActive ? "Nenhuma corrida neste período." : "Suas corridas concluídas aparecerão aqui."} />
          )}
          <div className="space-y-2">
            {history
              .map((ride) => (
                <Card key={ride.id} className={cn("shadow-soft", ride.status === "completed" && driverPaymentRowClass(paymentsByRide[ride.id]))}>
                  <CardContent className="space-y-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {ride.pet_name}{" "}
                          <span className="font-normal text-muted-foreground">
                            · {formatDateTime(ride.scheduled_at)}
                          </span>
                        </p>
                        {tutorNames[ride.id] && (
                          <p className="break-words text-sm text-muted-foreground">Tutor: {tutorNames[ride.id]}</p>
                        )}
                        <p className="text-sm text-muted-foreground">{tutorAccompanimentLabel(ride.tutor_accompanies_pet, ride.accompanying_people_count)}</p>
                        {ride.status === "completed" && <DriverPaymentStatus rideId={ride.id} scheduledAt={ride.scheduled_at} paidAt={paymentsByRide[ride.id]} amountCents={driverValueOf(ride)} completed />}
                        <p className="text-muted-foreground">
                          {ride.origin_address}
                          {(ride.stops ?? []).map((stop, i) => (
                            <span key={`${stop.address}-${i}`}> → Parada {i + 1}: {stop.address}</span>
                          ))}
                          {" "}→ {ride.destination_address}
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
                          {ride.status === "completed" ? formatBRL(driverValueOf(ride)) : "—"}
                        </span>
                      </div>
                    </div>
                    {ride.status === "completed" && user && (
                      <div className="border-t border-border pt-5">
                        <RideReview
                          rideId={ride.id}
                          reviewerId={user.id}
                          revieweeId={ride.tutor_id}
                          revieweeName="o tutor"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      {newRide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border-4 border-primary bg-primary p-6 text-primary-foreground shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em]">Nova chamada</p>
            <p className="mt-2 text-2xl font-extrabold">
              {newRide.pet_name} · {formatBRL(driverValueOf(newRide))}
            </p>
            <p className="mt-2 text-sm font-semibold">{tutorAccompanimentLabel(newRide.tutor_accompanies_pet, newRide.accompanying_people_count)}</p>
            <p className="mt-3 text-sm font-medium">
              Embarque: {newRide.origin_address}
              {newRide.origin_neighborhood ? ` · ${newRide.origin_neighborhood}` : ""}
            </p>
            {(newRide.stops ?? []).map((stop, i) => (
              <p key={`${stop.address}-${i}`} className="mt-1 text-sm font-medium">
                Parada {i + 1}: {stop.address}
              </p>
            ))}
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
  tutorName,
  children,
  showMap = false,
}: {
  ride: Ride;
  tutorName?: string | undefined;
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
            {tutorName && (
              <p className="break-words text-sm text-muted-foreground">Tutor: {tutorName}</p>
            )}
            <p className="text-sm font-medium">{tutorAccompanimentLabel(ride.tutor_accompanies_pet, ride.accompanying_people_count)}</p>
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
          <div className="space-y-2 sm:col-span-2">
            <AddressLink
              label="Embarque"
              address={ride.origin_address}
              lat={ride.origin_lat}
              lng={ride.origin_lng}
            />
            {(ride.stops ?? []).map((stop, i) => (
              <AddressLink
                key={`${stop.address}-${i}`}
                label={`Parada ${i + 1}`}
                address={stop.address}
                lat={stop.lat}
                lng={stop.lng}
                tone="stop"
              />
            ))}
            <AddressLink
              label="Destino"
              address={ride.destination_address}
              lat={ride.destination_lat}
              lng={ride.destination_lng}
              tone="destination"
            />
            <p className="text-xs text-muted-foreground">
              Toque no endereço para abrir a navegação no Waze ou no Google Maps.
            </p>
          </div>
          <p className="flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-primary-ink" />
            {formatDateTime(ride.scheduled_at)}
          </p>
          <p className="font-semibold text-foreground">
            {formatBRL(driverValueOf(ride))}{" "}
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

type DriverBonus = { id: string; amount_cents: number; description: string | null; completed_at: string | null; created_at: string };

function bonusesWithin(bonuses: DriverBonus[], start: Date, end: Date) {
  return bonuses.filter((b) => {
    const t = new Date(b.completed_at ?? b.created_at).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });
}

function DriverEarningsReport({
  period,
  rides,
  bonuses = [],
  tutorNames = {},
  paymentsByRide = {},
  periodLabel: customPeriodLabel,
}: {
  period: { title: string; subtitle: string; start: Date; end: Date };
  rides: Ride[];
  bonuses?: DriverBonus[];
  tutorNames?: Record<string, string>;
  paymentsByRide?: Record<string, string>;
  periodLabel?: string;
}) {
  const ridesTotal = rides.reduce((sum, ride) => sum + driverValueOf(ride), 0);
  const bonusTotal = bonuses.reduce((sum, b) => sum + b.amount_cents, 0);
  const total = ridesTotal + bonusTotal;
  const periodLabel = customPeriodLabel ?? `${formatSaoPauloDate(period.start)} a ${formatSaoPauloDate(period.end)}`;

  return (
    <Card className="overflow-hidden shadow-soft">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{period.title}</p>
            <p className="text-sm text-muted-foreground">{period.subtitle}</p>
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
            <WalletCards className="size-5" aria-hidden="true" />
          </div>
        </div>

        <div>
          <p className="text-3xl font-semibold">{formatBRL(total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Corridas {formatBRL(ridesTotal)} · Bônus {formatBRL(bonusTotal)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="size-3.5" aria-hidden="true" />
            {periodLabel} · {rides.length} {rides.length === 1 ? "corrida paga" : "corridas pagas"}
          </p>
        </div>

        <div className="divide-y border-t">
          {rides.length === 0 && bonuses.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma corrida paga neste período.</p>
          )}
          {bonuses.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{b.description ?? "Bônus"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  em {formatDateTime(b.completed_at ?? b.created_at)}
                </p>
              </div>
              <p className="shrink-0 font-semibold">{formatBRL(b.amount_cents)}</p>
            </div>
          ))}
          {rides.map((ride) => (
            <div key={ride.id} className={cn("flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm", driverPaymentRowClass(paymentsByRide[ride.id]))}>
              <div className="min-w-0">
                <p className="truncate font-medium">{ride.pet_name}</p>
                {tutorNames[ride.id] && (
                  <p className="break-words text-xs text-muted-foreground">Tutor: {tutorNames[ride.id]}</p>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  Viagem: {formatDateTime(ride.scheduled_at)}
                </p>
                <DriverPaymentStatus rideId={ride.id} scheduledAt={ride.scheduled_at} paidAt={paymentsByRide[ride.id]} amountCents={driverValueOf(ride)} completed />
              </div>
              <p className="shrink-0 font-semibold">{formatBRL(driverValueOf(ride))}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
