import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Download } from "lucide-react";
import { adminGetPayoutReport, type PayoutKind, type PayoutReport } from "@/lib/admin.functions";
import { formatBRL, formatDateTime } from "@/lib/rides";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/repasses")({
  head: () => ({
    meta: [
      { title: "Ganhos | GoPet Admin" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Relatórios de ganhos dos motoristas parceiros da GoPet.",
      },
      { property: "og:title", content: "Ganhos | GoPet Admin" },
      {
        property: "og:description",
        content: "Relatórios de ganhos dos motoristas parceiros da GoPet.",
      },
    ],
  }),
  component: AdminRepassesPage,
});

const descriptions: Record<PayoutKind, string> = {
  repasse1: "Gerado às sextas-feiras · corridas concluídas de segunda a quinta-feira.",
  repasse2: "Gerado às segundas-feiras · corridas de sexta, sábado e domingo anteriores.",
};

const labels: Record<PayoutKind, string> = {
  repasse1: "Ganhos Seg-Qui",
  repasse2: "Ganhos Sex-Dom",
};

function AdminRepassesPage() {
  const [reference, setReference] = useState<Date | undefined>();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DatePicker date={reference} setDate={setReference} />
        {reference && (
          <Button variant="ghost" className="rounded-full" onClick={() => setReference(undefined)}>
            Usar a data de hoje
          </Button>
        )}
      </div>

      <Tabs defaultValue="repasse1">
        <TabsList>
          <TabsTrigger value="repasse1">{labels.repasse1}</TabsTrigger>
          <TabsTrigger value="repasse2">{labels.repasse2}</TabsTrigger>
        </TabsList>
        <TabsContent value="repasse1" className="mt-4">
          <PayoutPanel kind="repasse1" reference={reference} />
        </TabsContent>
        <TabsContent value="repasse2" className="mt-4">
          <PayoutPanel kind="repasse2" reference={reference} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PayoutPanel({ kind, reference }: { kind: PayoutKind; reference: Date | undefined }) {
  const getPayout = useServerFn(adminGetPayoutReport);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payout", kind, reference?.toISOString() ?? "hoje"],
    queryFn: () =>
      getPayout({
        data: { kind, referenceDate: reference ? reference.toISOString() : null },
      }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card className="shadow-soft">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Período do relatório
            </p>
            <p className="mt-1 font-semibold">
              {spDate(data.startIso)} até {spDate(data.endIso)}
            </p>
            <p className="text-xs text-muted-foreground">{descriptions[kind]}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">{formatBRL(data.totalCents)}</p>
            <p className="text-xs text-muted-foreground">
              {data.totalRides} corridas · {data.drivers.length} motoristas
            </p>
          </div>
          <Button
            variant="secondary"
            className="rounded-full"
            disabled={data.drivers.length === 0}
            onClick={() => downloadCsv(data)}
          >
            <Download className="mr-2 size-4" />
            Baixar planilha
          </Button>
        </CardContent>
      </Card>

      {data.drivers.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma corrida concluída neste período.
          </CardContent>
        </Card>
      )}

      {data.drivers.map((g) => (
        <Card key={g.driverId} className="shadow-soft">
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{g.driverName}</p>
              <p className="text-lg font-semibold">{formatBRL(g.totalCents)}</p>
            </div>
            <div className="space-y-1 text-sm">
              {g.rides.map((r) => (
                <div key={r.id} className="flex justify-between gap-3">
                  <span className="truncate text-muted-foreground">
                    {formatDateTime(r.scheduledAt)} · {r.tutorName}
                  </span>
                  <span className="font-medium">{formatBRL(r.driverAmountCents)}</span>
                </div>
              ))}
              {g.adjustments.map((a) => (
                <div key={a.id} className="flex justify-between gap-3">
                  <span className="truncate text-muted-foreground">
                    {formatDateTime(a.createdAt)} ·{" "}
                    {a.kind === "bonus" ? "Bônus" : "Desconto"}
                    {a.description ? ` · ${a.description}` : ""}
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      a.kind === "desconto" ? "text-destructive" : "text-success",
                    )}
                  >
                    {a.kind === "desconto" ? "-" : "+"}
                    {formatBRL(a.amountCents)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">
                {g.rides.length} corridas · ajustes {formatBRL(Math.abs(g.adjustmentsCents))}
              </span>
              <span className="font-semibold">Total a pagar {formatBRL(g.totalCents)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Datas sempre no fuso de São Paulo, independentemente do aparelho. */
function spDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function downloadCsv(report: PayoutReport) {
  const lines = [["Motorista", "Corridas", "Valor corridas", "Ajustes", "Total a pagar"]];
  for (const g of report.drivers) {
    lines.push([
      g.driverName,
      String(g.rides.length),
      (g.ridesTotalCents / 100).toFixed(2),
      (g.adjustmentsCents / 100).toFixed(2),
      (g.totalCents / 100).toFixed(2),
    ]);
  }
  lines.push(["TOTAL", String(report.totalRides), "", "", (report.totalCents / 100).toFixed(2)]);
  const csv = lines.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.kind}-${report.startIso.slice(0, 10)}-a-${report.endIso.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DatePicker({
  date,
  setDate,
}: {
  date: Date | undefined;
  setDate: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-start text-left font-normal", !date && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? (
            <span>Referência: {format(date, "dd/MM/yyyy", { locale: ptBR })}</span>
          ) : (
            <span>Data de referência (hoje)</span>
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
