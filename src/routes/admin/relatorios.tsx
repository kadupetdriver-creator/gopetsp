import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetReport } from "@/lib/admin.functions";
import { formatBRL, formatDateTime, statusLabels, type RideStatus } from "@/lib/rides";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios | GoPet Admin" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Relatório de corridas, bônus e descontos da GoPet." },
      { property: "og:title", content: "Relatórios | GoPet Admin" },
      { property: "og:description", content: "Relatório de corridas, bônus e descontos da GoPet." },
    ],
  }),
  component: AdminRelatoriosPage,
});

const kindLabels: Record<string, string> = {
  bonus: "Bônus",
  credito: "Crédito manual",
  desconto: "Desconto",
};

function AdminRelatoriosPage() {
  const getReport = useServerFn(adminGetReport);
  const [tutorId, setTutorId] = useState("all");
  const [driverId, setDriverId] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-report"],
    queryFn: () => getReport({ data: undefined }),
  });

  const tutorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data?.rides ?? []) map.set(r.tutorId, r.tutorName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data]);

  const driverOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data?.rides ?? []) if (r.driverId && r.driverName) map.set(r.driverId, r.driverName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data]);

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

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Filtrar pelo nome do tutor ou motorista"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <Skeleton className="h-64 w-full rounded-2xl" />}

      {!isLoading && (
        <>
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
