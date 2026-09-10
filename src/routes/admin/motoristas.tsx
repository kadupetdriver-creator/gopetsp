import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, ExternalLink, Loader2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import {
  documentStatusLabels,
  documentTypes,
  driverStatusLabels,
  driverStatusStyles,
  isValidCPF,
  isValidPhone,
  isValidPlate,
  maskCPF,
  maskPhone,
  maskPlate,
  onlyDigits,
  vehicleTypes,
  type DocumentStatus,
  type DocumentType,
  type DriverStatus,
} from "@/lib/drivers";
import { Field } from "./tutores";

export const Route = createFileRoute("/admin/motoristas")({
  head: () => ({
    meta: [
      { title: "Motoristas | GoPet Admin" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Painel interno para revisar documentos, editar e aprovar motoristas parceiros da GoPet.",
      },
      { property: "og:title", content: "Motoristas | GoPet Admin" },
      { property: "og:description", content: "Revisão e gestão de motoristas parceiros." },
    ],
  }),
  component: AdminMotoristasPage,
});

type Vehicle = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  vehicle_type: string;
};

type Application = {
  id: string;
  user_id: string;
  full_name: string;
  cpf: string;
  birth_date: string;
  phone: string;
  email: string;
  city: string;
  neighborhood: string;
  avatar_path: string | null;
  status: DriverStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  created_at: string;
  vehicles: Vehicle | null;
  driver_documents: {
    id: string;
    document_type: DocumentType;
    file_path: string;
    status: DocumentStatus;
    notes: string | null;
  }[];
};

const cols =
  "id, user_id, full_name, cpf, birth_date, phone, email, city, neighborhood, avatar_path, status, rejection_reason, submitted_at, created_at, vehicles(id, plate, brand, model, year, color, vehicle_type), driver_documents(id, document_type, file_path, status, notes)";

const statusOrder: Record<DriverStatus, number> = {
  pendente: 0,
  em_analise: 1,
  aprovado: 2,
  suspenso: 3,
  rejeitado: 4,
};

function AdminMotoristasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "fila" | DriverStatus>("fila");
  const [editing, setEditing] = useState<Application | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select(cols).order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Application[];
    },
  });

  const counts = useMemo(() => {
    const c = { fila: 0, todos: data?.length ?? 0 } as Record<string, number>;
    for (const d of data ?? []) {
      c[d.status] = (c[d.status] ?? 0) + 1;
      if (d.status === "pendente" || d.status === "em_analise") c["fila"] = (c["fila"] ?? 0) + 1;
    }
    return c;
  }, [data]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((d) => {
        if (filter === "fila") return d.status === "pendente" || d.status === "em_analise";
        if (filter !== "todos") return d.status === filter;
        return true;
      })
      .filter((d) => {
        if (!q) return true;
        return [d.full_name, d.email, d.phone, d.cpf, d.vehicles?.plate, d.neighborhood].some((v) =>
          v?.toLowerCase().includes(q),
        );
      })
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [data, search, filter]);

  const review = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: DriverStatus; reason?: string | undefined }) => {
      const { error } = await supabase.rpc("review_driver_application", {
        _driver_id: id,
        _status: status,
        ...(reason ? { _reason: reason } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro atualizado.");
      void qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  const reviewDoc = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: DocumentStatus; notes?: string | undefined }) => {
      const { error } = await supabase
        .from("driver_documents")
        .update({ status, notes: notes ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-drivers"] }),
    onError: () => toast.error("Não foi possível atualizar o documento."),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, e-mail, CPF, telefone ou placa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fila">Fila de revisão ({counts["fila"] ?? 0})</SelectItem>
            <SelectItem value="todos">Todos ({counts["todos"] ?? 0})</SelectItem>
            {(Object.keys(driverStatusLabels) as DriverStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {driverStatusLabels[s]} ({counts[s] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-48 w-full rounded-2xl" />}
      {!isLoading && list.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum motorista encontrado com esse filtro.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {list.map((app) => (
          <ApplicationCard
            key={app.id}
            app={app}
            busy={review.isPending}
            onEdit={() => setEditing(app)}
            onReview={(status, reason) => review.mutate({ id: app.id, status, reason })}
            onReviewDoc={(id, status, notes) => reviewDoc.mutate({ id, status, notes })}
          />
        ))}
      </div>

      {editing && (
        <EditDriverDialog
          app={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ["admin-drivers"] });
          }}
        />
      )}
    </div>
  );
}

function ApplicationCard({
  app,
  busy,
  onEdit,
  onReview,
  onReviewDoc,
}: {
  app: Application;
  busy: boolean;
  onEdit: () => void;
  onReview: (status: DriverStatus, reason?: string) => void;
  onReviewDoc: (id: string, status: DocumentStatus, notes?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<null | "rejeitado" | "suspenso">(null);
  const v = app.vehicles;
  const age = Math.floor((Date.now() - new Date(app.birth_date).getTime()) / (365.25 * 24 * 3600e3));
  const highlight = app.status === "pendente" || app.status === "em_analise";

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("driver-documents").createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className={cn("shadow-soft", highlight && "border-primary/60 ring-1 ring-primary/30")}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{app.full_name}</CardTitle>
            <CardDescription>
              {app.email} · {maskPhone(app.phone)} · CPF {maskCPF(app.cpf)} · {age} anos
            </CardDescription>
            <CardDescription>
              {app.neighborhood}, {app.city} · enviado em{" "}
              {new Date(app.submitted_at ?? app.created_at).toLocaleDateString("pt-BR")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", driverStatusStyles[app.status])}>
              {driverStatusLabels[app.status]}
            </span>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-2 size-4" /> Editar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {app.avatar_path && (
          <Button variant="link" className="h-auto p-0 text-sm" onClick={() => openFile(app.avatar_path!)}>
            Ver foto de perfil <ExternalLink className="ml-1 size-3" />
          </Button>
        )}

        <div className="rounded-xl bg-secondary p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Car className="size-4" /> Veículo
          </p>
          {v ? (
            <p className="mt-1 text-secondary-foreground">
              {v.brand} {v.model} {v.year} · {v.color} · placa {v.plate} ·{" "}
              {vehicleTypes.find((t) => t.value === v.vehicle_type)?.label ?? v.vehicle_type}
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">Veículo ainda não informado.</p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Documentos</p>
          {documentTypes.map((t) => {
            const doc = app.driver_documents.find((d) => d.document_type === t.value);
            return (
              <div
                key={t.value}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{t.label}</span>
                {doc ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{documentStatusLabels[doc.status]}</span>
                    <Button size="sm" variant="outline" onClick={() => openFile(doc.file_path)}>
                      Ver <ExternalLink className="ml-1 size-3" />
                    </Button>
                    {doc.status !== "aprovado" && (
                      <Button size="sm" variant="ghost" onClick={() => onReviewDoc(doc.id, "aprovado")}>
                        OK
                      </Button>
                    )}
                    {doc.status !== "rejeitado" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          const notes = window.prompt("Motivo da recusa do documento:") ?? "";
                          if (notes.trim()) onReviewDoc(doc.id, "rejeitado", notes.trim());
                        }}
                      >
                        Recusar
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Não enviado</span>
                )}
              </div>
            );
          })}
        </div>

        {(app.status === "rejeitado" || app.status === "suspenso") && app.rejection_reason && (
          <p className="rounded-xl bg-destructive/5 p-3 text-sm">
            <strong className="text-destructive">
              {app.status === "suspenso" ? "Motivo da suspensão:" : "Motivo da rejeição:"}
            </strong>{" "}
            {app.rejection_reason}
          </p>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          {mode && (
            <Textarea
              placeholder={
                mode === "suspenso"
                  ? "Explique o motivo da suspensão"
                  : "Explique ao motorista o que precisa ser corrigido"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {mode ? (
              <>
                <Button
                  variant="destructive"
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => {
                    onReview(mode, reason.trim());
                    setMode(null);
                    setReason("");
                  }}
                >
                  {mode === "suspenso" ? "Confirmar suspensão" : "Confirmar rejeição"}
                </Button>
                <Button variant="ghost" onClick={() => setMode(null)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                {app.status === "pendente" && (
                  <Button variant="outline" disabled={busy} onClick={() => onReview("em_analise")}>
                    Iniciar análise
                  </Button>
                )}
                {app.status !== "aprovado" && (
                  <Button disabled={busy} onClick={() => onReview("aprovado")}>
                    {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {app.status === "suspenso" ? "Reativar" : "Aprovar"}
                  </Button>
                )}
                {app.status !== "rejeitado" && app.status !== "suspenso" && (
                  <Button variant="outline" className="text-destructive" onClick={() => setMode("rejeitado")}>
                    Rejeitar
                  </Button>
                )}
                {app.status === "aprovado" && (
                  <Button variant="outline" className="text-destructive" onClick={() => setMode("suspenso")}>
                    Suspender
                  </Button>
                )}
                {(app.status === "rejeitado" || app.status === "suspenso") && (
                  <Button variant="ghost" disabled={busy} onClick={() => onReview("pendente")}>
                    Reabrir para revisão
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditDriverDialog({
  app,
  onClose,
  onSaved,
}: {
  app: Application;
  onClose: () => void;
  onSaved: () => void;
}) {
  const v = app.vehicles;
  const [form, setForm] = useState({
    full_name: app.full_name,
    cpf: maskCPF(app.cpf),
    birth_date: app.birth_date,
    phone: maskPhone(app.phone),
    email: app.email,
    city: app.city,
    neighborhood: app.neighborhood,
    plate: v?.plate ?? "",
    brand: v?.brand ?? "",
    model: v?.model ?? "",
    year: v ? String(v.year) : "",
    color: v?.color ?? "",
    vehicle_type: v?.vehicle_type ?? "hatch",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!isValidCPF(form.cpf)) throw new Error("CPF inválido");
      if (!isValidPhone(form.phone)) throw new Error("Telefone inválido");
      const { error } = await supabase
        .from("drivers")
        .update({
          full_name: form.full_name.trim(),
          cpf: onlyDigits(form.cpf),
          birth_date: form.birth_date,
          phone: onlyDigits(form.phone),
          email: form.email.trim(),
          city: form.city.trim(),
          neighborhood: form.neighborhood.trim(),
        })
        .eq("id", app.id);
      if (error) throw error;

      const hasVehicle = form.plate || form.brand || form.model;
      if (hasVehicle) {
        if (!isValidPlate(form.plate)) throw new Error("Placa inválida");
        const year = Number(form.year);
        if (!Number.isInteger(year) || year < 1990 || year > new Date().getFullYear() + 1) {
          throw new Error("Ano do veículo inválido");
        }
        const vehicle = {
          plate: maskPlate(form.plate),
          brand: form.brand.trim(),
          model: form.model.trim(),
          year,
          color: form.color.trim(),
          vehicle_type: form.vehicle_type,
        };
        const { error: vErr } = v
          ? await supabase.from("vehicles").update(vehicle).eq("id", v.id)
          : await supabase.from("vehicles").insert({ ...vehicle, driver_id: app.id });
        if (vErr) throw vErr;
      }
    },
    onSuccess: () => {
      toast.success("Cadastro do motorista atualizado.");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const getBalance = useServerFn(adminGetCreditBalance);
  const grantBonus = useServerFn(adminGrantDriverBonus);
  const [bonusValue, setBonusValue] = useState("");
  const [bonusReason, setBonusReason] = useState("");

  const balance = useQuery({
    queryKey: ["admin-driver-balance", app.user_id],
    queryFn: () => getBalance({ data: { userId: app.user_id } }),
  });

  const bonusCents = Math.round(
    Number(bonusValue.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "")) * 100,
  );
  const validBonus = Number.isFinite(bonusCents) && bonusCents > 0 && bonusCents <= 1000000 && bonusReason.trim().length >= 3;

  const bonus = useMutation({
    mutationFn: () =>
      grantBonus({ data: { driverUserId: app.user_id, amountCents: bonusCents, reason: bonusReason.trim() } }),
    onSuccess: () => {
      toast.success("Bônus lançado para o motorista.");
      setBonusValue("");
      setBonusReason("");
      void balance.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível lançar o bônus."),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar motorista</DialogTitle>
          <DialogDescription>Dados pessoais e do veículo. O status é alterado pelos botões do cartão.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nome completo">
              <Input value={form.full_name} onChange={set("full_name")} />
            </Field>
          </div>
          <Field label="CPF">
            <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} />
          </Field>
          <Field label="Nascimento">
            <Input type="date" value={form.birth_date} onChange={set("birth_date")} />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} />
          </Field>
          <Field label="E-mail de contato">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Cidade">
            <Input value={form.city} onChange={set("city")} />
          </Field>
          <Field label="Bairro">
            <Input value={form.neighborhood} onChange={set("neighborhood")} />
          </Field>

          <p className="mt-2 text-sm font-medium sm:col-span-2">Veículo</p>
          <Field label="Placa">
            <Input value={form.plate} onChange={(e) => setForm({ ...form, plate: maskPlate(e.target.value) })} />
          </Field>
          <Field label="Ano">
            <Input inputMode="numeric" value={form.year} onChange={set("year")} />
          </Field>
          <Field label="Marca">
            <Input value={form.brand} onChange={set("brand")} />
          </Field>
          <Field label="Modelo">
            <Input value={form.model} onChange={set("model")} />
          </Field>
          <Field label="Cor">
            <Input value={form.color} onChange={set("color")} />
          </Field>
          <Field label="Tipo">
            <Select value={form.vehicle_type} onValueChange={(val) => setForm({ ...form, vehicle_type: val })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vehicleTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending || !form.full_name.trim()} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
