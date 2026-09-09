import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  documentStatusLabels,
  documentTypes,
  driverStatusLabels,
  driverStatusStyles,
  maskCPF,
  maskPhone,
  vehicleTypes,
  type DocumentStatus,
  type DocumentType,
  type DriverStatus,
} from "@/lib/drivers";

export const Route = createFileRoute("/admin/motoristas")({
  head: () => ({
    meta: [
      { title: "Aprovação de motoristas | GoPet Admin" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Painel interno para revisar documentos e aprovar motoristas parceiros da GoPet.",
      },
      { property: "og:title", content: "Aprovação de motoristas | GoPet Admin" },
      { property: "og:description", content: "Revisão de cadastros de motoristas parceiros." },
    ],
  }),
  component: AdminMotoristasPage,
});

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
  vehicles: {
    plate: string;
    brand: string;
    model: string;
    year: number;
    color: string;
    vehicle_type: string;
  } | null;
  driver_documents: {
    id: string;
    document_type: DocumentType;
    file_path: string;
    status: DocumentStatus;
    notes: string | null;
  }[];
};

const cols =
  "id, user_id, full_name, cpf, birth_date, phone, email, city, neighborhood, avatar_path, status, rejection_reason, submitted_at, created_at, vehicles(plate, brand, model, year, color, vehicle_type), driver_documents(id, document_type, file_path, status, notes)";

function AdminMotoristasPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-drivers"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select(cols)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Application[];
    },
  });

  const review = useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: DriverStatus;
      reason?: string;
    }) => {
      const { error } = await supabase.rpc("review_driver_application", {
        _driver_id: id,
        _status: status,
        _reason: reason ?? undefined,
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
    mutationFn: async ({ id, status, notes }: { id: string; status: DocumentStatus; notes?: string }) => {
      const { error } = await supabase
        .from("driver_documents")
        .update({ status, notes: notes ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-drivers"] }),
    onError: () => toast.error("Não foi possível atualizar o documento."),
  });

  if (loading) return null;

  if (user && !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Área restrita</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta página é exclusiva da equipe de aprovação da GoPet.
        </p>
      </div>
    );
  }

  const pending = data?.filter((d) => d.status === "pendente" || d.status === "em_analise") ?? [];
  const decided = data?.filter((d) => d.status === "aprovado" || d.status === "rejeitado") ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Aprovação de motoristas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Revise documentos e libere ou recuse cadastros de motoristas parceiros.
      </p>

      <Tabs defaultValue="fila" className="mt-6">
        <TabsList>
          <TabsTrigger value="fila">Fila ({pending.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico ({decided.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="fila" className="mt-5 space-y-4">
          {isLoading && <Skeleton className="h-48 w-full rounded-2xl" />}
          {!isLoading && pending.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cadastro aguardando revisão.
              </CardContent>
            </Card>
          )}
          {pending.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              busy={review.isPending}
              onReview={(status, reason) => review.mutate({ id: app.id, status, reason })}
              onReviewDoc={(id, status, notes) => reviewDoc.mutate({ id, status, notes })}
            />
          ))}
        </TabsContent>
        <TabsContent value="historico" className="mt-5 space-y-4">
          {decided.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cadastro decidido ainda.
              </CardContent>
            </Card>
          )}
          {decided.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              busy={review.isPending}
              onReview={(status, reason) => review.mutate({ id: app.id, status, reason })}
              onReviewDoc={(id, status, notes) => reviewDoc.mutate({ id, status, notes })}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ApplicationCard({
  app,
  busy,
  onReview,
  onReviewDoc,
}: {
  app: Application;
  busy: boolean;
  onReview: (status: DriverStatus, reason?: string) => void;
  onReviewDoc: (id: string, status: DocumentStatus, notes?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const v = app.vehicles;
  const age = Math.floor((Date.now() - new Date(app.birth_date).getTime()) / (365.25 * 24 * 3600e3));

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("driver-documents")
      .createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className="shadow-soft">
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
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", driverStatusStyles[app.status])}>
            {driverStatusLabels[app.status]}
          </span>
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

        {app.status === "rejeitado" && app.rejection_reason && (
          <p className="rounded-xl bg-destructive/5 p-3 text-sm">
            <strong className="text-destructive">Motivo da rejeição:</strong> {app.rejection_reason}
          </p>
        )}

        {app.status !== "aprovado" && (
          <div className="space-y-3 border-t border-border pt-4">
            {rejecting && (
              <Textarea
                placeholder="Explique ao motorista o que precisa ser corrigido"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {app.status === "pendente" && (
                <Button variant="outline" disabled={busy} onClick={() => onReview("em_analise")}>
                  Iniciar análise
                </Button>
              )}
              <Button disabled={busy} onClick={() => onReview("aprovado")}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Aprovar
              </Button>
              {rejecting ? (
                <>
                  <Button
                    variant="destructive"
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => {
                      onReview("rejeitado", reason.trim());
                      setRejecting(false);
                      setReason("");
                    }}
                  >
                    Confirmar rejeição
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                app.status !== "rejeitado" && (
                  <Button variant="outline" className="text-destructive" onClick={() => setRejecting(true)}>
                    Rejeitar
                  </Button>
                )
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
