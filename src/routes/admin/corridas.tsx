import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, Pencil, Search, Send, XCircle } from "lucide-react";
import { downloadCsvFile } from "@/lib/csv";
import { toast } from "sonner";
import { refundRidePayment } from "@/lib/payments.functions";
import { supabase } from "@/integrations/supabase/client";
import { adminRideAmounts, canAdminCompleteRide, isAvailableRide, matchesAdminRideFilter as matchesFilter, type RideFilter } from "@/lib/admin-rides";
import { adminCompleteRide } from "@/lib/admin-rides.functions";
import {
  formatBRL,
  formatDateTime,
  formatTime,
  serviceTypes,
  statusLabels,
  statusStyles,
  type RideStatus,
} from "@/lib/rides";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./tutores";

export const Route = createFileRoute("/admin/corridas")({
  head: () => ({
    meta: [
      { title: "Corridas | GoPet Admin" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Acompanhe e edite todas as corridas da GoPet." },
      { property: "og:title", content: "Corridas | GoPet Admin" },
      { property: "og:description", content: "Acompanhe e edite todas as corridas da GoPet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCorridasPage,
});

type Ride = {
  id: string;
  tutor_id: string;
  driver_id: string | null;
  preferred_driver_id: string | null;
  preferred_until: string | null;
  pet_name: string;
  service_type: string;
  origin_address: string;
  destination_address: string;
  scheduled_at: string;
  notes: string | null;
  price_cents: number;
  distance_km: number;
  status: RideStatus;
  created_at: string;
  paid_at: string | null;
  driver_requested_at: string | null;
};

type Person = { id: string; full_name: string; role: "tutor" | "driver" };

const allStatuses: RideStatus[] = ["pending", "accepted", "en_route", "in_progress", "completed", "cancelled"];
const activeGroup: RideStatus[] = ["pending", "accepted", "en_route", "in_progress"];

const filterOptions: { value: RideFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "disponiveis", label: "Disponíveis" },
  { value: "aceitas", label: "Aceitas" },
  { value: "andamento", label: "Em andamento" },
  { value: "completed", label: "Concluídas" },
  { value: "cancelled", label: "Canceladas" },
];

const emptyMessages: Record<RideFilter, string> = {
  todas: "Nenhuma corrida encontrada.",
  disponiveis: "Nenhuma corrida disponível no bolsão geral agora.",
  aceitas: "Nenhuma corrida aceita por motorista agora.",
  andamento: "Nenhuma corrida em andamento.",
  completed: "Nenhuma corrida concluída.",
  cancelled: "Nenhuma corrida cancelada.",
};

function AdminCorridasPage() {
  const qc = useQueryClient();
  const refundPayment = useServerFn(refundRidePayment);
  const completeRide = useServerFn(adminCompleteRide);
  const [finishing, setFinishing] = useState<Ride | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RideFilter>("todas");
  const [editing, setEditing] = useState<Ride | null>(null);
  const [forwarding, setForwarding] = useState<Ride | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-rides"],
    queryFn: async () => {
      const { data: rides, error } = await supabase
        .from("rides")
        .select(
          "id, tutor_id, driver_id, preferred_driver_id, preferred_until, pet_name, service_type, origin_address, destination_address, scheduled_at, notes, price_cents, distance_km, status, created_at, paid_at, driver_requested_at",
        )
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      const { data: people } = await supabase.from("profiles").select("id, full_name, role");
      return { rides: (rides ?? []) as unknown as Ride[], people: (people ?? []) as Person[] };
    },
  });

  const names = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p.full_name])), [data]);

  const counts = useMemo(() => {
    const rides = data?.rides ?? [];
    return Object.fromEntries(
      filterOptions.map((o) => [o.value, rides.filter((r) => matchesFilter(r, o.value)).length]),
    ) as Record<RideFilter, number>;
  }, [data]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rides ?? []).filter((r) => {
      if (!matchesFilter(r, filter)) return false;
      if (!q) return true;
      return [
        r.pet_name,
        r.origin_address,
        r.destination_address,
        names.get(r.tutor_id),
        r.driver_id ? names.get(r.driver_id) : "",
        r.id,
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [data, search, filter, names]);

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rides").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
      const result = await refundPayment({ data: { rideId: id } });
      if ("error" in result) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success("Corrida cancelada.");
      void qc.invalidateQueries({ queryKey: ["admin-rides"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível cancelar."),
  });

  const finish = useMutation({
    mutationFn: (rideId: string) => completeRide({ data: { rideId } }),
    onSuccess: () => {
      toast.success("Corrida finalizada pela administração.");
      setFinishing(null);
      void qc.invalidateQueries({ queryKey: ["admin-rides"] });
      void qc.invalidateQueries({ queryKey: ["admin-report"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível finalizar."),
  });

  const exportCsv = () => {
    const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    downloadCsvFile(`gopet-corridas-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["ID", "Data agendada", "Pet", "Serviço", "Tutor", "Motorista", "Origem", "Destino", "Distância (km)", "Status", "Pagamento", "Data pagamento", "Valor total (R$)", "Valor motorista 75% (R$)"],
      ...list.map((r) => {
        const a = adminRideAmounts(r.price_cents);
        return [
          r.id,
          formatDateTime(r.scheduled_at),
          r.pet_name,
          serviceTypes.find((s) => s.value === r.service_type)?.label ?? r.service_type,
          names.get(r.tutor_id) ?? "",
          r.driver_id ? (names.get(r.driver_id) ?? "") : "Não atribuído",
          r.origin_address,
          r.destination_address,
          String(r.distance_km).replace(".", ","),
          statusLabels[r.status],
          r.paid_at ? "Aprovado" : "Pendente",
          r.paid_at ? formatDateTime(r.paid_at) : "",
          fmt(a.totalCents),
          fmt(a.driverCents),
        ];
      }),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por pet, tutor, motorista ou endereço"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" disabled={list.length === 0} onClick={exportCsv}>
          <Download className="mr-2 size-4" /> Baixar planilha
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-full bg-secondary p-1">
        {filterOptions.map((o) => (
          <Button
            key={o.value}
            type="button"
            variant="ghost"
            aria-pressed={filter === o.value}
            onClick={() => setFilter(o.value)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              filter === o.value && "bg-background text-foreground shadow-soft",
            )}
          >
            {o.label}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                filter === o.value ? "bg-primary/15 text-primary-ink" : "bg-background/70 text-muted-foreground",
              )}
            >
              {counts[o.value] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {!isLoading && list.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {emptyMessages[filter]}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {list.map((r) => {
          const pay = r.paid_at ? "pagamento aprovado" : "pagamento pendente";
          return (
            <Card key={r.id} className="shadow-soft">
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {r.pet_name} · {serviceTypes.find((s) => s.value === r.service_type)?.label ?? r.service_type}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tutor: {names.get(r.tutor_id) ?? "—"} · Motorista:{" "}
                      {r.driver_id ? (names.get(r.driver_id) ?? "—") : "não atribuído"}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusStyles[r.status])}>
                    {statusLabels[r.status]}
                  </span>
                </div>
                {isAvailableRide(r) && r.preferred_until && new Date(r.preferred_until) > new Date() && (
                  <p className="text-xs font-semibold text-primary-ink">
                    Reservada ao motorista preferencial do tutor até {formatTime(r.preferred_until)}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {r.origin_address} → {r.destination_address}
                </p>
                <p className="text-sm">
                  {formatDateTime(r.scheduled_at)} · Valor total: <strong>{formatBRL(adminRideAmounts(r.price_cents).totalCents)}</strong> · {r.distance_km} km
                  <span className="ml-2 text-xs text-muted-foreground">{pay}</span>
                </p>
                {(r.driver_id || isAvailableRide(r)) && (
                  <p className="text-sm text-muted-foreground">
                    Valor ao motorista (75%): <strong className="text-foreground">{formatBRL(adminRideAmounts(r.price_cents).driverCents)}</strong>
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {canAdminCompleteRide(r) && (
                    <Button size="sm" variant="outline" onClick={() => setFinishing(r)}>
                      <CheckCircle2 className="mr-2 size-4" /> Finalizar corrida
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                    <Pencil className="mr-2 size-4" /> Editar
                  </Button>
                  {activeGroup.includes(r.status) && r.status !== "in_progress" && (
                    <Button size="sm" onClick={() => setForwarding(r)}>
                      <Send className="mr-2 size-4" /> Encaminhar a motorista
                    </Button>
                  )}
                  {activeGroup.includes(r.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={cancel.isPending}
                      onClick={() => {
                        if (window.confirm("Cancelar esta corrida manualmente?")) cancel.mutate(r.id);
                      }}
                    >
                      <XCircle className="mr-2 size-4" /> Cancelar corrida
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {finishing && (
        <Dialog open onOpenChange={(open) => { if (!open && !finish.isPending) setFinishing(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Finalizar corrida</DialogTitle>
              <DialogDescription>
                Confirma que o transporte de {finishing.pet_name} já terminou? A corrida será marcada como concluída, sem alterar o valor ou o pagamento.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" disabled={finish.isPending} onClick={() => setFinishing(null)}>Voltar</Button>
              <Button disabled={finish.isPending} onClick={() => finish.mutate(finishing.id)}>
                {finish.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Confirmar finalização
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <EditRideDialog
          ride={editing}
          people={data?.people ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ["admin-rides"] });
          }}
        />
      )}

      {forwarding && (
        <ForwardRideDialog
          ride={forwarding}
          people={data?.people ?? []}
          onClose={() => setForwarding(null)}
          onSaved={() => {
            setForwarding(null);
            void qc.invalidateQueries({ queryKey: ["admin-rides"] });
          }}
        />
      )}
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditRideDialog({
  ride,
  people,
  onClose,
  onSaved,
}: {
  ride: Ride;
  people: Person[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const closed = ride.status === "completed" || ride.status === "cancelled";
  const [form, setForm] = useState({
    status: ride.status,
    driver_id: ride.driver_id ?? "none",
  });
  const drivers = people.filter((p) => p.role === "driver");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("rides")
        .update({
          status: form.status,
          driver_id: form.driver_id === "none" ? null : form.driver_id,
        })
        .eq("id", ride.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corrida atualizada.");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar corrida</DialogTitle>
          <DialogDescription>
            Ajustes manuais. Cancelamentos de corridas pagas solicitam reembolso integral.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as RideStatus })}
              disabled={closed}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {closed && (
              <p className="text-xs text-muted-foreground">Corridas concluídas ou canceladas não mudam de status.</p>
            )}
          </Field>
          <Field label="Motorista">
            <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não atribuído</SelectItem>
                {drivers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <p>
              <strong>Valor:</strong> {formatBRL(ride.price_cents)} · <strong>Tutor:</strong>{" "}
              {people.find((p) => p.id === ride.tutor_id)?.full_name ?? "—"} · <strong>Data:</strong>{" "}
              {formatDateTime(ride.scheduled_at)}
            </p>
            <p className="mt-1">
              Valor e pagamento não são editáveis aqui. Reembolsos seguem pelo cancelamento da corrida.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Encaminhamento manual: o administrador atribui a corrida a um motorista, mesmo com conflito de horário. */
function ForwardRideDialog({
  ride,
  people,
  onClose,
  onSaved,
}: {
  ride: Ride;
  people: Person[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [driverId, setDriverId] = useState(ride.driver_id ?? "");
  const drivers = people.filter((p) => p.role === "driver");

  const send = useMutation({
    mutationFn: async () => {
      const blank = driverId === "none";
      const { error } = await supabase
        .from("rides")
        .update({
          driver_id: blank ? null : driverId,
          status: blank ? "pending" : "accepted",
        })
        .eq("id", ride.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        driverId === "none" ? "Corrida devolvida ao bolsão geral, sem motorista." : "Corrida encaminhada ao motorista.",
      );
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível encaminhar."),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encaminhar corrida</DialogTitle>
          <DialogDescription>
            A corrida é atribuída diretamente ao motorista escolhido, mesmo que ele já tenha outra corrida no mesmo
            horário. Escolha "Em branco" para deixar sem motorista e devolver a corrida ao bolsão geral.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Motorista">
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motorista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Em branco (bolsão geral)</SelectItem>
                {drivers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            {formatDateTime(ride.scheduled_at)} · {ride.pet_name} · {ride.origin_address} → {ride.destination_address}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={driverId === "" || send.isPending} onClick={() => send.mutate()}>
            {send.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {driverId === "none" ? "Encaminhar em branco" : "Encaminhar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
