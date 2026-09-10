import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, UserCog } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminAdjustCredits,
  adminGetCreditBalance,
  adminSetAccountActive,
  adminUpdateUserEmail,
} from "@/lib/admin.functions";
import { maskPhone } from "@/lib/drivers";
import { formatBRL } from "@/lib/rides";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/tutores")({
  head: () => ({
    meta: [
      { title: "Tutores | GoPet Admin" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Gerencie os tutores cadastrados na GoPet." },
      { property: "og:title", content: "Tutores | GoPet Admin" },
      { property: "og:description", content: "Gerencie os tutores cadastrados na GoPet." },
    ],
  }),
  component: AdminTutoresPage,
});

type Tutor = {
  id: string;
  full_name: string;
  phone: string | null;
  city: string;
  address: string | null;
  role: "tutor" | "driver";
  is_active: boolean;
  created_at: string;
  email?: string;
};

function AdminTutoresPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [editing, setEditing] = useState<Tutor | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tutors"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: emails }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone, city, address, role, is_active, created_at")
          .eq("role", "tutor")
          .order("created_at", { ascending: false }),
        supabase.rpc("admin_user_emails"),
      ]);
      if (error) throw error;
      const byId = new Map((emails ?? []).map((e) => [e.user_id, e.email]));
      return (profiles ?? []).map((p) => ({ ...p, email: byId.get(p.id) ?? undefined })) as Tutor[];
    },
  });

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((t) => {
      if (filter === "ativos" && !t.is_active) return false;
      if (filter === "inativos" && t.is_active) return false;
      if (!q) return true;
      return [t.full_name, t.email, t.phone, t.address, t.city].some((v) => v?.toLowerCase().includes(q));
    });
  }, [data, search, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, e-mail, telefone ou endereço"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativos">Ativos</SelectItem>
            <SelectItem value="inativos">Desativados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {!isLoading && list.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum tutor encontrado.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {list.map((t) => (
          <Card key={t.id} className={cn("shadow-soft", !t.is_active && "opacity-70")}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  {t.full_name || "Sem nome"}
                  {!t.is_active && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      Desativado
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {t.email ?? "—"} · {t.phone ? maskPhone(t.phone) : "sem telefone"}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {t.address || t.city} · desde {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(t)}>
                <UserCog className="mr-2 size-4" /> Editar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <EditTutorDialog
          tutor={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ["admin-tutors"] });
          }}
        />
      )}
    </div>
  );
}

function EditTutorDialog({
  tutor,
  onClose,
  onSaved,
}: {
  tutor: Tutor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: tutor.full_name,
    phone: tutor.phone ?? "",
    email: tutor.email ?? "",
    address: tutor.address ?? "",
    city: tutor.city,
    is_active: tutor.is_active,
  });
  const updateEmail = useServerFn(adminUpdateUserEmail);
  const setActive = useServerFn(adminSetAccountActive);
  const getBalance = useServerFn(adminGetCreditBalance);
  const adjustCredits = useServerFn(adminAdjustCredits);
  const [creditInput, setCreditInput] = useState("");
  const [creditNote, setCreditNote] = useState("");

  const balance = useQuery({
    queryKey: ["admin-tutor-balance", tutor.id],
    queryFn: () => getBalance({ data: { userId: tutor.id } }),
  });

  const parsedCents = Math.round(
    Number(creditInput.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) * 100,
  );
  const validCredit = Number.isFinite(parsedCents) && parsedCents !== 0 && Math.abs(parsedCents) <= 1000000;

  const addCredits = useMutation({
    mutationFn: () =>
      adjustCredits({
        data: { userId: tutor.id, amountCents: parsedCents, ...(creditNote.trim() ? { note: creditNote.trim() } : {}) },
      }),
    onSuccess: (res) => {
      toast.success("Saldo atualizado.");
      setCreditInput("");
      setCreditNote("");
      balance.refetch();
      void res;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível lançar o saldo."),
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || "São Paulo",
        })
        .eq("id", tutor.id);
      if (error) throw error;
      if (form.email.trim() && form.email.trim() !== (tutor.email ?? "")) {
        await updateEmail({ data: { userId: tutor.id, email: form.email.trim() } });
      }
      if (form.is_active !== tutor.is_active) {
        await setActive({ data: { userId: tutor.id, active: form.is_active } });
      }
    },
    onSuccess: () => {
      toast.success("Tutor atualizado.");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar tutor</DialogTitle>
          <DialogDescription>Altere os dados pessoais ou ative/desative a conta.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Nome completo">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="E-mail de acesso">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Endereço">
            <Input
              placeholder="Rua, número, bairro"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Cidade">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <div className="space-y-3 rounded-xl border border-border px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Saldo de créditos</p>
              <span className="text-sm font-semibold">
                {balance.isLoading ? "…" : formatBRL(balance.data?.balanceCents ?? 0)}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Valor a lançar (R$)">
                <Input
                  inputMode="decimal"
                  placeholder="50,00"
                  value={creditInput}
                  onChange={(e) => setCreditInput(e.target.value)}
                />
              </Field>
              <Field label="Motivo (opcional)">
                <Input
                  placeholder="Ex.: cortesia"
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Use valor negativo (ex.: -20,00) para retirar saldo. O lançamento aparece no extrato do tutor.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!validCredit || addCredits.isPending}
              onClick={() => addCredits.mutate()}
            >
              {addCredits.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Lançar saldo
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
            <div>
              <p className="text-sm font-medium">Conta ativa</p>
              <p className="text-xs text-muted-foreground">
                Contas desativadas não conseguem entrar nem solicitar corridas.
              </p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
