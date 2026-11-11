import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminListCancellations, adminSetCancellationException } from "@/lib/cancellation.functions";
import { CANCELLATION_FEES_ACTIVE, driverStateLabels, tierLabels, type CancellationTier, type DriverState } from "@/lib/cancellation-policy";
import { formatBRL } from "@/lib/rides";

export const Route = createFileRoute("/admin/cancelamentos")({
  head: () => ({
    meta: [
      { title: "Cancelamentos | GoPet Admin" },
      { name: "description", content: "Cancelamentos de corridas, taxas e exceções." },
      { property: "og:title", content: "Cancelamentos | GoPet Admin" },
      { property: "og:description", content: "Cancelamentos de corridas, taxas e exceções." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CancellationsPage,
});

const exceptionLabels: Record<string, string> = {
  gopet_failure: "Falha da GoPet", driver_failure: "Falha do motorista", other: "Outra exceção",
};
const dt = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";
const spDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

type Row = Awaited<ReturnType<typeof adminListCancellations>>[number];

function CancellationsPage() {
  const listFn = useServerFn(adminListCancellations);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-cancellations"], queryFn: () => listFn() });
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [state, setState] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null);

  const rows = useMemo(() => (data ?? []).filter((r) => {
    const d = spDay(r.cancelled_at);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (state !== "all" && r.driver_state !== state) return false;
    return true;
  }), [data, from, to, state]);
  const totals = rows.reduce((a, r) => ({ fee: a.fee + r.fee_cents, refund: a.refund + r.refund_cents, share: a.share + r.driver_share_cents }), { fee: 0, refund: 0, share: 0 });

  const exportCsv = () => {
    const head = ["Cancelada em", "Agendada para", "Pet", "Tutor", "Motorista", "Situação do motorista", "Saiu a caminho", "Chegou", "Motivo", "Faixa", "Taxa %", "Valor corrida", "Taxa", "Reembolso previsto", "Parcela motorista", "Exceção", "Justificativa"];
    const lines = rows.map((r) => [dt(r.cancelled_at), dt(r.scheduled_at), r.pet_name, r.tutor_name, r.driver_name ?? "", driverStateLabels[r.driver_state as DriverState] ?? r.driver_state, dt(r.en_route_at), dt(r.arrived_at), r.reason ?? "", tierLabels[r.tier as CancellationTier] ?? r.tier, r.rate_percent, formatBRL(r.ride_price_cents), formatBRL(r.fee_cents), formatBRL(r.refund_cents), formatBRL(r.driver_share_cents), r.exception_kind ? exceptionLabels[r.exception_kind] : "", r.exception_notes ?? ""]);
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "cancelamentos-gopet.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      {!CANCELLATION_FEES_ACTIVE && (
        <div className="flex items-start gap-2 rounded-xl border border-primary bg-foreground p-3 text-sm text-background">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>Modo de testes: as taxas são apenas calculadas e registradas como previstas. Nenhuma cobrança ou estorno parcial é executado até a aprovação jurídica.</span>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">De<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs">Até<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {Object.entries(driverStateLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="mr-2 size-4" />Planilha</Button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Card><CardContent className="py-3"><p className="text-muted-foreground">Taxas previstas</p><p className="font-semibold">{formatBRL(totals.fee)}</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-muted-foreground">Reembolsos previstos</p><p className="font-semibold">{formatBRL(totals.refund)}</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-muted-foreground">Parcela motoristas</p><p className="font-semibold">{formatBRL(totals.share)}</p></CardContent></Card>
      </div>
      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {!isLoading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cancelamento registrado.</p>}
      {rows.map((r) => (
        <Card key={r.id} className={r.exception_kind ? "border-primary" : undefined}>
          <CardContent className="space-y-2 py-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{r.pet_name} · {r.tutor_name}</p>
              <span className="text-muted-foreground">Cancelada em {dt(r.cancelled_at)}</span>
            </div>
            <p>Agendada: {dt(r.scheduled_at)} · Motorista: {r.driver_name ?? "—"} · Situação: <b>{driverStateLabels[r.driver_state as DriverState] ?? r.driver_state}</b></p>
            <p className="text-muted-foreground">Saiu a caminho: {dt(r.en_route_at)} · Chegou: {dt(r.arrived_at)}</p>
            <p>Motivo: {r.reason || "—"}</p>
            <p className="font-medium">{tierLabels[r.tier as CancellationTier] ?? r.tier}</p>
            <p>Corrida {formatBRL(r.ride_price_cents)} · Taxa {r.rate_percent}% = <b>{formatBRL(r.fee_cents)}</b> · Reembolso {formatBRL(r.refund_cents)} · Motorista {formatBRL(r.driver_share_cents)}{!r.was_paid && " · não paga"}</p>
            {r.exception_kind && <p className="rounded-lg bg-primary/15 px-2 py-1">Exceção: {exceptionLabels[r.exception_kind]} — {r.exception_notes} ({dt(r.exception_at)})</p>}
            <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Analisar exceção</Button>
          </CardContent>
        </Card>
      ))}
      {editing && <ExceptionDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ["admin-cancellations"] }); }} />}
    </div>
  );
}

function ExceptionDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const fn = useServerFn(adminSetCancellationException);
  const [kind, setKind] = useState<string>(row.exception_kind ?? "none");
  const [notes, setNotes] = useState(row.exception_notes ?? "");
  const save = useMutation({
    mutationFn: () => fn({ data: { id: row.id, kind: kind === "none" ? null : (kind as "gopet_failure"), notes } }),
    onSuccess: () => { toast.success("Análise salva."); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Analisar exceção</DialogTitle></DialogHeader>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem exceção (aplicar política)</SelectItem>
            {Object.entries(exceptionLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v} — sem taxa</SelectItem>)}
          </SelectContent>
        </Select>
        <Textarea placeholder="Justificativa" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
