import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, CalendarRange, WalletCards } from "lucide-react";
import { adminGetReport } from "@/lib/admin.functions";
import { refreshEtaCalibration } from "@/lib/eta.functions";
import { formatBRL, formatDateTime, statusLabels, type RideStatus } from "@/lib/rides";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios | GoPet Admin" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Relatório de corridas, bônus e descontos da GoPet." },
      { property: "og:title", content: "Relatórios | GoPet Admin" },
      { property: "og:description", content: "Relatório de corridas, bônus e descontos da GoPet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRelatoriosPage,
});

const kindLabels: Record<string, string> = {
  bonus: "Bônus",
  credito: "Crédito manual",
  desconto: "Desconto",
};

type ReportRide = Awaited<ReturnType<typeof adminGetReport>>["rides"][number];

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

function localDateToUtc(year: number, month: number, day: number, endOfDay = false) {
  return new Date(Date.UTC(year, month - 1, day, SAO_PAULO_OFFSET_HOURS + (endOfDay ? 23 : 0), endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
}

function addCalendarDays(date: Date, days: number, endOfDay = false) {
  const shifted = new Date(date.getTime() + days * 86_400_000);
  return endOfDay
    ? new Date(shifted.getTime() + 86_400_000 - 1)
    : shifted;
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
      subtitle: "Faturamento de segunda a quinta-feira",
      start: fridayBase,
      end: addCalendarDays(fridayBase, 3, true),
    },
    monday: {
      title: "Ganhos Segunda-Feira",
      subtitle: "Faturamento de sexta-feira a domingo",
      start: mondayBase,
      end: addCalendarDays(mondayBase, 2, true),
    },
  };
}

function paidWithin(rides: ReportRide[], start: Date, end: Date) {
  return rides.filter((ride) => {
    if (!ride.paidAt) return false;
    const paidAt = new Date(ride.paidAt).getTime();
    return paidAt >= start.getTime() && paidAt <= end.getTime();
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

function AdminRelatoriosPage() {
  const getReport = useServerFn(adminGetReport);
  const runCalibration = useServerFn(refreshEtaCalibration);
  const calibrar = useMutation({ mutationFn: () => runCalibration({ data: undefined }) });
  const [tutorId, setTutorId] = useState("all");
  const [driverId, setDriverId] = useState("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-report", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: () =>
      getReport({
        data: {
          startDate: startDate ? startDate.toISOString() : null,
          endDate: endDate ? endDate.toISOString() : null,
        },
      }),
  });

  const { data: weeklyData, isLoading: isWeeklyLoading } = useQuery({
    queryKey: ["admin-weekly-earnings"],
    queryFn: () => getReport({ data: { startDate: null, endDate: null } }),
  });

  const tutorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of [...(data?.rides ?? []), ...(weeklyData?.rides ?? [])]) map.set(r.tutorId, r.tutorName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data, weeklyData]);

  const driverOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of [...(data?.rides ?? []), ...(weeklyData?.rides ?? [])]) if (r.driverId && r.driverName) map.set(r.driverId, r.driverName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data, weeklyData]);

  const rides = useMemo(
    () =>
      (data?.rides ?? []).filter(
        (r) =>
          (tutorId === "all" || r.tutorId === tutorId) &&
          (driverId === "all" || r.driverId === driverId),
      ),
    [data, tutorId, driverId],
  );

  const selectedNames = useMemo(() => {
    const names = new Set<string>();
    if (tutorId !== "all") names.add(tutorOptions.find((t) => t.id === tutorId)?.name ?? "");
    if (driverId !== "all") names.add(driverOptions.find((d) => d.id === driverId)?.name ?? "");
    return names;
  }, [tutorId, driverId, tutorOptions, driverOptions]);

  const entries = useMemo(
    () => (data?.entries ?? []).filter((e) => selectedNames.size === 0 || selectedNames.has(e.personName)),
    [data, selectedNames],
  );

  const totalRides = rides.reduce((acc, r) => acc + r.priceCents, 0);
  const totalBonus = entries.filter((e) => e.kind !== "desconto").reduce((acc, e) => acc + e.amountCents, 0);
  const totalDesconto = entries.filter((e) => e.kind === "desconto").reduce((acc, e) => acc + e.amountCents, 0);
  const earningsPeriods = useMemo(() => latestCompletedEarningsPeriods(), []);
  const weeklyRides = useMemo(
    () =>
      (weeklyData?.rides ?? []).filter(
        (r) =>
          (tutorId === "all" || r.tutorId === tutorId) &&
          (driverId === "all" || r.driverId === driverId),
      ),
    [weeklyData, tutorId, driverId],
  );
  const fridayEarnings = useMemo(
    () => paidWithin(weeklyRides, earningsPeriods.friday.start, earningsPeriods.friday.end),
    [weeklyRides, earningsPeriods],
  );
  const mondayEarnings = useMemo(
    () => paidWithin(weeklyRides, earningsPeriods.monday.start, earningsPeriods.monday.end),
    [weeklyRides, earningsPeriods],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">Treinar estimativa de tempo</p>
            <p className="text-sm text-muted-foreground">
              Recalcula o trânsito por dia da semana e horário com as corridas reais concluídas nos últimos 90 dias.
            </p>
            {calibrar.data && (
              <p className="mt-1 text-sm text-primary">
                {calibrar.data.faixasAtualizadas} faixas de horário atualizadas com dados reais.
              </p>
            )}
            {calibrar.isError && (
              <p className="mt-1 text-sm text-destructive">
                {(calibrar.error as Error)?.message ?? "Não foi possível recalcular agora."}
              </p>
            )}
          </div>
          <Button onClick={() => calibrar.mutate()} disabled={calibrar.isPending}>
            {calibrar.isPending ? "Calculando..." : "Treinar com corridas reais"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DatePicker label="De" date={startDate} setDate={setStartDate} />
        <DatePicker label="Até" date={endDate} setDate={setEndDate} />
        <Select value={tutorId} onValueChange={setTutorId}>
          <SelectTrigger>
            <SelectValue placeholder="Todos os tutores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tutores</SelectItem>
            {tutorOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={driverId} onValueChange={setDriverId}>
          <SelectTrigger>
            <SelectValue placeholder="Todos os motoristas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os motoristas</SelectItem>
            {driverOptions.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(isLoading || isWeeklyLoading) && <Skeleton className="h-64 w-full rounded-2xl" />}

      {!isLoading && !isWeeklyLoading && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <EarningsReport period={earningsPeriods.friday} rides={fridayEarnings} />
            <EarningsReport period={earningsPeriods.monday} rides={mondayEarnings} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Corridas" value={`${rides.length}`} hint={formatBRL(totalRides)} />
            <SummaryCard label="Bônus e créditos" value={formatBRL(totalBonus)} hint={`${entries.filter((e) => e.kind !== "desconto").length} lançamentos`} />
            <SummaryCard label="Descontos" value={formatBRL(totalDesconto)} hint={`${entries.filter((e) => e.kind === "desconto").length} lançamentos`} />
          </div>

          <Tabs defaultValue="corridas">
            <TabsList>
              <TabsTrigger value="corridas">Corridas</TabsTrigger>
              <TabsTrigger value="lancamentos">Bônus e descontos</TabsTrigger>
            </TabsList>

            <TabsContent value="corridas" className="mt-4 space-y-3">
              {rides.length === 0 && <EmptyState text="Nenhuma corrida encontrada." />}
              {rides.map((r) => (
                <Card key={r.id} className="shadow-soft">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {r.tutorName}
                        <span className="text-muted-foreground"> · {r.driverName ?? "sem motorista"}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(r.scheduledAt)} · {statusLabels[r.status as RideStatus] ?? r.status}
                        {r.paymentStatus ? ` · pagamento ${r.paymentStatus}` : ""}
                      </p>
                    </div>
                    <p className="font-semibold">{formatBRL(r.priceCents)}</p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="lancamentos" className="mt-4 space-y-3">
              {entries.length === 0 && <EmptyState text="Nenhum lançamento encontrado." />}
              {entries.map((e) => (
                <Card key={e.id} className="shadow-soft">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {e.personName} <span className="text-muted-foreground">· {e.personRole}</span>
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDateTime(e.createdAt)} · {kindLabels[e.kind]}
                        {e.description ? ` · ${e.description}` : ""}
                      </p>
                    </div>
                    <p className={e.kind === "desconto" ? "font-semibold text-destructive" : "font-semibold"}>
                      {e.kind === "desconto" ? "-" : "+"}
                      {formatBRL(e.amountCents)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function EarningsReport({
  period,
  rides,
}: {
  period: { title: string; subtitle: string; start: Date; end: Date };
  rides: ReportRide[];
}) {
  const total = rides.reduce((sum, ride) => sum + ride.priceCents, 0);
  const periodLabel = `${formatSaoPauloDate(period.start)} a ${formatSaoPauloDate(period.end)}`;

  return (
    <Card className="overflow-hidden shadow-soft">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{period.title}</p>
            <p className="text-sm text-muted-foreground">{period.subtitle}</p>
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <WalletCards className="size-5" aria-hidden="true" />
          </div>
        </div>

        <div>
          <p className="text-3xl font-semibold">{formatBRL(total)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="size-3.5" aria-hidden="true" />
            {periodLabel} · {rides.length} {rides.length === 1 ? "corrida paga" : "corridas pagas"}
          </p>
        </div>

        <div className="divide-y border-t">
          {rides.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">Nenhum pagamento confirmado neste período.</p>
          )}
          {rides.map((ride) => (
            <div key={ride.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{ride.tutorName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ride.driverName ?? "Sem motorista"} · pago em {ride.paidAt ? formatDateTime(ride.paidAt) : "—"}
                </p>
              </div>
              <p className="shrink-0 font-semibold">{formatBRL(ride.priceCents)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DatePicker({
  label,
  date,
  setDate,
}: {
  label: string;
  date: Date | undefined;
  setDate: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? (
            <span>{format(date, "dd/MM/yyyy", { locale: ptBR })}</span>
          ) : (
            <span>{label}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="shadow-soft">
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
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
