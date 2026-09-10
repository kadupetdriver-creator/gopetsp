import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateTime, serviceTypes, statusLabels, statusStyles, type RideStatus } from "@/lib/rides";
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
    ],
  }),
  component: AdminCorridasPage,
});

type Ride = {
  id: string;
  tutor_id: string;
  driver_id: string | null;
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
  ride_payments: { status: string; payment_method: string }[];
};

type Person = { id: string; full_name: string; role: "tutor" | "driver" };

const allStatuses: RideStatus[] = ["pending", "accepted", "en_route", "in_progress", "completed", "cancelled"];
const activeGroup: RideStatus[] = ["pending", "accepted", "en_route", "in_progress"];

function AdminCorridasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "andamento" | "completed" | "cancelled">("todas");
  const [editing, setEditing] = useState<Ride | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-rides"],
    queryFn: async () => {
      const { data: rides, error } = await supabase
        .from("rides")
        .select(
          "id, tutor_id, driver_id, pet_name, service_type, origin_address, destination_address, scheduled_at, notes, price_cents, distance_km, status, created_at, ride_payments(status, payment_method)",
        )
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      const { data: people } = await supabase.from("profiles").select("id, full_name, role");
      return { rides: (rides ?? []) as unknown as Ride[], people: (people ?? []) as Person[] };
    },
  });

  const names = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p.full_name])), [data]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rides ?? []).filter((r) => {
      if (filter === "andamento" && !activeGroup.includes(r.status)) return false;
      if (filter === "completed" && r.status !== "completed") return false;
      if (filter === "cancelled" && r.status !== "cancelled") return false;
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
    },
    onSuccess: () => {
      toast.success("Corrida cancelada.");
      void qc.invalidateQueries({ queryKey: ["admin-rides"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível cancelar."),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por pet, tutor, motorista ou endereço"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="andamento">Em andamento</SelectItem>
            <SelectItem value="completed">Concluídas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {!isLoading && list.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma corrida encontrada.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {list.map((r) => {
          const pay = r.ride_payments?.[0];
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
                <p className="text-sm text-muted-foreground">
                  {r.origin_address} → {r.destination_address}
                </p>
                <p className="text-sm">
                  {formatDateTime(r.scheduled_at)} · <strong>{formatBRL(r.price_cents)}</strong> · {r.distance_km} km
                  {pay && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      pagamento: {pay.status} ({pay.payment_method})
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                    <Pencil className="mr-2 size-4" /> Editar
                  </Button>
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
            Ajustes manuais. Estornos e repasses financeiros não são disparados automaticamente por aqui.
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
          <Field label="Tutor">
            <Select value={form.tutor_id} onValueChange={(v) => setForm({ ...form, tutor_id: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tutors.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Field label="Valor (R$)">
            <Input
              inputMode="decimal"
              value={form.price}
              disabled={paid}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            {paid && <p className="text-xs text-muted-foreground">Valor bloqueado: a corrida já foi paga.</p>}
          </Field>
          <Field label="Data e horário">
            <Input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            />
          </Field>
          <Field label="Observações">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
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
