import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Car, CheckCircle2, FileCheck2, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_DOC_TYPES,
  MAX_DOC_BYTES,
  documentStatusLabels,
  documentTypes,
  driverStatusLabels,
  driverStatusStyles,
  fileExtension,
  isAdult,
  isValidCPF,
  isValidPhone,
  isValidPlate,
  maskCPF,
  maskPhone,
  maskPlate,
  onlyDigits,
  vehicleColors,
  vehicleTypes,
  type DocumentStatus,
  type DocumentType,
  type DriverStatus,
} from "@/lib/drivers";

export const Route = createFileRoute("/seja-motorista")({
  head: () => ({
    meta: [
      { title: "Seja motorista parceiro | GoPet" },
      {
        name: "description",
        content:
          "Cadastre-se como motorista parceiro da GoPet em São Paulo: dados pessoais, veículo e documentos em três etapas simples.",
      },
      { property: "og:title", content: "Seja motorista parceiro | GoPet" },
      {
        property: "og:description",
        content: "Cadastro de motoristas parceiros para transporte de pets em São Paulo.",
      },
    ],
  }),
  component: SejaMotoristaPage,
});

type DriverRow = {
  id: string;
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
};

type VehicleRow = {
  id: string;
  plate: string;
  model: string;
  brand: string;
  year: number;
  color: string;
  vehicle_type: string;
};

type DocumentRow = {
  id: string;
  document_type: DocumentType;
  file_path: string;
  status: DocumentStatus;
  notes: string | null;
};

const steps = [
  { id: 1, label: "Seus dados", icon: UserRound },
  { id: 2, label: "Veículo", icon: Car },
  { id: 3, label: "Documentos", icon: FileCheck2 },
];

const currentYear = new Date().getFullYear();

function SejaMotoristaPage() {
  // Só tutores solicitam promoção; motoristas aprovados são levados ao painel.
  const { user, profile, loading } = useRoleGuard("tutor", "/seja-motorista");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);

  const { data: application, isLoading } = useQuery({
    queryKey: ["driver-application", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: driver, error } = await supabase
        .from("drivers")
        .select(
          "id, full_name, cpf, birth_date, phone, email, city, neighborhood, avatar_path, status, rejection_reason",
        )
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!driver) return { driver: null, vehicle: null, documents: [] as DocumentRow[] };
      const [{ data: vehicle }, { data: documents }] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, plate, model, brand, year, color, vehicle_type")
          .eq("driver_id", driver.id)
          .maybeSingle(),
        supabase
          .from("driver_documents")
          .select("id, document_type, file_path, status, notes")
          .eq("driver_id", driver.id),
      ]);
      return {
        driver: driver as DriverRow,
        vehicle: (vehicle as VehicleRow | null) ?? null,
        documents: (documents as DocumentRow[] | null) ?? [],
      };
    },
  });

  const driver = application?.driver ?? null;
  const locked =
    driver?.status === "em_analise" || driver?.status === "aprovado" || driver?.status === "suspenso";

  if (loading || isLoading || !user) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (driver && locked) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <StatusCard driver={driver} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Seja motorista parceiro</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Complete as três etapas. Nossa equipe revisa seus documentos e libera as chamadas.
      </p>

      {driver?.status === "rejeitado" && (
        <div className="mt-5 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">Cadastro rejeitado</p>
          <p className="mt-1 text-muted-foreground">
            Motivo: {driver.rejection_reason ?? "não informado"}. Corrija os dados ou reenvie os
            documentos e envie novamente para análise.
          </p>
        </div>
      )}

      <ol className="mt-6 grid grid-cols-3 gap-2">
        {steps.map((s) => {
          const done = s.id < step;
          const active = s.id === step;
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={s.id > 1 && !driver}
                onClick={() => setStep(s.id)}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-medium transition-colors disabled:opacity-50",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : done
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border text-muted-foreground",
                )}
              >
                {done ? <CheckCircle2 className="size-5" /> : <s.icon className="size-5" />}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        {step === 1 && (
          <PersonalStep
            userId={user!.id}
            defaults={{
              full_name: driver?.full_name ?? profile?.full_name ?? "",
              cpf: driver?.cpf ?? "",
              birth_date: driver?.birth_date ?? "",
              phone: driver?.phone ?? profile?.phone ?? "",
              email: driver?.email ?? user?.email ?? "",
              city: driver?.city ?? "São Paulo",
              neighborhood: driver?.neighborhood ?? "",
              avatar_path: driver?.avatar_path ?? null,
            }}
            driverId={driver?.id ?? null}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: ["driver-application"] });
              setStep(2);
            }}
          />
        )}
        {step === 2 && driver && (
          <VehicleStep
            driverId={driver.id}
            vehicle={application?.vehicle ?? null}
            onBack={() => setStep(1)}
            onSaved={async () => {
              await qc.invalidateQueries({ queryKey: ["driver-application"] });
              setStep(3);
            }}
          />
        )}
        {step === 3 && driver && (
          <DocumentsStep
            userId={user!.id}
            driver={driver}
            hasVehicle={!!application?.vehicle}
            documents={application?.documents ?? []}
            onBack={() => setStep(2)}
            onSubmitted={async () => {
              await qc.invalidateQueries({ queryKey: ["driver-application"] });
              void navigate({ to: "/motorista" });
            }}
          />
        )}
      </div>
    </div>
  );
}

export function StatusCard({ driver }: { driver: DriverRow | { status: DriverStatus; rejection_reason: string | null } }) {
  const descriptions: Record<DriverStatus, string> = {
    pendente:
      "Recebemos seu cadastro. Nossa equipe vai revisar seus dados e documentos em breve.",
    em_analise: "Seus documentos estão sendo verificados. Avisamos assim que houver novidade.",
    aprovado: "Tudo certo! Você já pode receber chamadas de transporte de pets.",
    rejeitado: "Seu cadastro não foi aprovado desta vez. Veja o motivo e reenvie os documentos.",
    suspenso: "Seu cadastro está suspenso temporariamente. Entre em contato com o suporte GoPet.",
  };
  return (
    <Card className="shadow-soft">
      <CardHeader>
        <span
          className={cn(
            "w-fit rounded-full px-3 py-1 text-xs font-semibold",
            driverStatusStyles[driver.status],
          )}
        >
          {driverStatusLabels[driver.status]}
        </span>
        <CardTitle className="mt-2">Situação do seu cadastro</CardTitle>
        <CardDescription>{descriptions[driver.status]}</CardDescription>
      </CardHeader>
      {driver.status === "suspenso" && driver.rejection_reason && (
        <CardContent>
          <p className="rounded-xl bg-destructive/5 p-3 text-sm">
            <strong className="text-destructive">Motivo:</strong> {driver.rejection_reason}
          </p>
        </CardContent>
      )}
      {driver.status === "rejeitado" && (
        <CardContent className="space-y-4">
          <p className="rounded-xl bg-destructive/5 p-3 text-sm">
            <strong className="text-destructive">Motivo:</strong>{" "}
            {driver.rejection_reason ?? "não informado"}
          </p>
          <Button onClick={() => (window.location.href = "/seja-motorista")}>
            Corrigir e reenviar documentos
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

// ---------- Etapa 1 ----------
type PersonalDefaults = {
  full_name: string;
  cpf: string;
  birth_date: string;
  phone: string;
  email: string;
  city: string;
  neighborhood: string;
  avatar_path: string | null;
};

function PersonalStep({
  userId,
  driverId,
  defaults,
  onSaved,
}: {
  userId: string;
  driverId: string | null;
  defaults: PersonalDefaults;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(defaults);
  const [avatar, setAvatar] = useState<File | null>(null);
  const preview = useMemo(() => (avatar ? URL.createObjectURL(avatar) : null), [avatar]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const set = (k: keyof PersonalDefaults, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (form.full_name.trim().length < 5) throw new Error("Informe seu nome completo.");
      if (!isValidCPF(form.cpf)) throw new Error("CPF inválido.");
      if (!isAdult(form.birth_date)) throw new Error("É preciso ter ao menos 18 anos.");
      if (!isValidPhone(form.phone)) throw new Error("Telefone inválido. Use DDD + número.");
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email.trim()))
        throw new Error("E-mail inválido.");
      if (form.city.trim().length < 2) throw new Error("Informe a cidade.");
      if (form.neighborhood.trim().length < 2) throw new Error("Informe o bairro.");
      if (!avatar && !form.avatar_path) throw new Error("Envie a foto de perfil.");

      let avatar_path = form.avatar_path;
      if (avatar) {
        if (!avatar.type.startsWith("image/")) throw new Error("A foto deve ser uma imagem.");
        if (avatar.size > MAX_DOC_BYTES) throw new Error("A foto deve ter até 10 MB.");
        const path = `${userId}/avatar-${Date.now()}.${fileExtension(avatar)}`;
        const { error } = await supabase.storage
          .from("driver-documents")
          .upload(path, avatar, { upsert: true, contentType: avatar.type });
        if (error) throw new Error("Não foi possível enviar a foto.");
        avatar_path = path;
      }

      const payload = {
        user_id: userId,
        full_name: form.full_name.trim(),
        cpf: onlyDigits(form.cpf),
        birth_date: form.birth_date,
        phone: onlyDigits(form.phone),
        email: form.email.trim().toLowerCase(),
        city: form.city.trim(),
        neighborhood: form.neighborhood.trim(),
        avatar_path,
      };
      const { error } = driverId
        ? await supabase.from("drivers").update(payload).eq("id", driverId)
        : await supabase.from("drivers").insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Dados pessoais salvos.");
      await onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Seus dados</CardTitle>
        <CardDescription>Usamos essas informações para verificar sua identidade.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex items-center gap-4 sm:col-span-2">
            <label className="relative flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-secondary">
              {preview ? (
                <img src={preview} alt="Prévia da foto de perfil" className="size-full object-cover" />
              ) : (
                <Camera className="size-6 text-muted-foreground" />
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="text-sm">
              <p className="font-medium">Foto de perfil (obrigatória)</p>
              <p className="text-muted-foreground">
                {form.avatar_path && !avatar ? "Foto enviada. Toque para trocar." : "Rosto visível, sem óculos escuros."}
              </p>
            </div>
          </div>

          <Field label="Nome completo" id="nome" className="sm:col-span-2">
            <Input id="nome" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
          </Field>
          <Field label="CPF" id="cpf">
            <Input
              id="cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={maskCPF(form.cpf)}
              onChange={(e) => set("cpf", maskCPF(e.target.value))}
              required
            />
          </Field>
          <Field label="Data de nascimento" id="nasc">
            <Input
              id="nasc"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={form.birth_date}
              onChange={(e) => set("birth_date", e.target.value)}
              required
            />
          </Field>
          <Field label="Telefone (WhatsApp)" id="tel">
            <Input
              id="tel"
              inputMode="tel"
              placeholder="(11) 90000-0000"
              value={maskPhone(form.phone)}
              onChange={(e) => set("phone", maskPhone(e.target.value))}
              required
            />
          </Field>
          <Field label="E-mail" id="email">
            <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
          </Field>
          <Field label="Cidade" id="cidade">
            <Input id="cidade" value={form.city} onChange={(e) => set("city", e.target.value)} required />
          </Field>
          <Field label="Bairro" id="bairro">
            <Input id="bairro" placeholder="Ex.: Pinheiros" value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} required />
          </Field>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending} className="w-full sm:w-auto">
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar e continuar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------- Etapa 2 ----------
function VehicleStep({
  driverId,
  vehicle,
  onBack,
  onSaved,
}: {
  driverId: string;
  vehicle: VehicleRow | null;
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    plate: vehicle?.plate ?? "",
    model: vehicle?.model ?? "",
    brand: vehicle?.brand ?? "",
    year: vehicle ? String(vehicle.year) : "",
    color: vehicle?.color ?? "",
    vehicle_type: vehicle?.vehicle_type ?? "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!isValidPlate(form.plate)) throw new Error("Placa inválida. Ex.: ABC1D23.");
      if (form.brand.trim().length < 2) throw new Error("Informe a marca.");
      if (form.model.trim().length < 2) throw new Error("Informe o modelo.");
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < currentYear - 15 || year > currentYear + 1)
        throw new Error(`O veículo deve ser de ${currentYear - 15} ou mais novo.`);
      if (!form.color) throw new Error("Selecione a cor.");
      if (!form.vehicle_type) throw new Error("Selecione o tipo de veículo.");

      const payload = {
        driver_id: driverId,
        plate: maskPlate(form.plate),
        model: form.model.trim(),
        brand: form.brand.trim(),
        year,
        color: form.color,
        vehicle_type: form.vehicle_type,
      };
      const { error } = vehicle
        ? await supabase.from("vehicles").update(payload).eq("id", vehicle.id)
        : await supabase.from("vehicles").insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Veículo salvo.");
      await onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const selectedType = vehicleTypes.find((t) => t.value === form.vehicle_type);

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Dados do veículo</CardTitle>
        <CardDescription>
          O tipo do veículo define o porte de pet que você poderá transportar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Placa" id="placa">
            <Input id="placa" placeholder="ABC1D23" value={form.plate} onChange={(e) => set("plate", maskPlate(e.target.value))} required />
          </Field>
          <Field label="Ano" id="ano">
            <Input id="ano" inputMode="numeric" placeholder={String(currentYear)} value={form.year} onChange={(e) => set("year", onlyDigits(e.target.value).slice(0, 4))} required />
          </Field>
          <Field label="Marca" id="marca">
            <Input id="marca" placeholder="Ex.: Fiat" value={form.brand} onChange={(e) => set("brand", e.target.value)} required />
          </Field>
          <Field label="Modelo" id="modelo">
            <Input id="modelo" placeholder="Ex.: Doblò" value={form.model} onChange={(e) => set("model", e.target.value)} required />
          </Field>
          <Field label="Cor" id="cor">
            <Select value={form.color} onValueChange={(v) => set("color", v)} required>
              <SelectTrigger id="cor"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {vehicleColors.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tipo de veículo" id="tipo">
            <Select value={form.vehicle_type} onValueChange={(v) => set("vehicle_type", v)} required>
              <SelectTrigger id="tipo"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {vehicleTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-xs text-muted-foreground">Transporta: {selectedType.capacity}</p>
            )}
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onBack}>Voltar</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar e continuar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------- Etapa 3 ----------
function DocumentsStep({
  userId,
  driver,
  hasVehicle,
  documents,
  onBack,
  onSubmitted,
}: {
  userId: string;
  driver: DriverRow;
  hasVehicle: boolean;
  documents: DocumentRow[];
  onBack: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<DocumentType | null>(null);

  const upload = async (type: DocumentType, file: File) => {
    if (!ACCEPTED_DOC_TYPES.split(",").includes(file.type)) {
      toast.error("Envie uma imagem (JPG, PNG, WEBP) ou PDF.");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      toast.error("O arquivo deve ter até 10 MB.");
      return;
    }
    setUploading(type);
    try {
      const path = `${userId}/${type}-${Date.now()}.${fileExtension(file)}`;
      const { error: upErr } = await supabase.storage
        .from("driver-documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw new Error("Não foi possível enviar o arquivo.");
      const existing = documents.find((d) => d.document_type === type);
      const { error } = existing
        ? await supabase.from("driver_documents").update({ file_path: path }).eq("id", existing.id)
        : await supabase
            .from("driver_documents")
            .insert({ driver_id: driver.id, document_type: type, file_path: path });
      if (error) throw error;
      if (existing) {
        await supabase.storage.from("driver-documents").remove([existing.file_path]);
      }
      toast.success("Documento enviado.");
      await qc.invalidateQueries({ queryKey: ["driver-application"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setUploading(null);
    }
  };

  const allSent = documentTypes.every((t) => documents.some((d) => d.document_type === t.value));

  const submit = useMutation({
    mutationFn: async () => {
      if (!hasVehicle) throw new Error("Cadastre o veículo antes de enviar.");
      if (!allSent) throw new Error("Envie os três documentos para concluir.");
      const patch: { submitted_at: string; status?: "pendente" } = {
        submitted_at: new Date().toISOString(),
      };
      if (driver.status === "rejeitado") patch.status = "pendente";
      const { error } = await supabase.from("drivers").update(patch).eq("id", driver.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Cadastro enviado para análise!");
      await onSubmitted();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível enviar."),
  });

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Documentos</CardTitle>
        <CardDescription>
          Fotos nítidas ou PDF, até 10 MB cada. Ficam em área privada, vistos só pela nossa equipe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {documentTypes.map((t) => {
          const doc = documents.find((d) => d.document_type === t.value);
          return (
            <div key={t.value} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.hint}</p>
                </div>
                {doc && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      doc.status === "aprovado"
                        ? "bg-success/15 text-success"
                        : doc.status === "rejeitado"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-warning/20 text-warning-foreground",
                    )}
                  >
                    {documentStatusLabels[doc.status]}
                  </span>
                )}
              </div>
              {doc?.status === "rejeitado" && doc.notes && (
                <p className="mt-2 text-xs text-destructive">Motivo: {doc.notes}</p>
              )}
              <label className="mt-3 inline-flex">
                <span
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-secondary",
                    uploading === t.value && "pointer-events-none opacity-60",
                  )}
                >
                  {uploading === t.value && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {doc ? "Reenviar arquivo" : "Enviar arquivo"}
                </span>
                <input
                  type="file"
                  accept={ACCEPTED_DOC_TYPES}
                  className="sr-only"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(t.value, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          );
        })}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onBack}>Voltar</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !allSent}>
            {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {driver.status === "rejeitado" ? "Reenviar para análise" : "Enviar cadastro para análise"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  id,
  className,
  children,
}: {
  label: string;
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
