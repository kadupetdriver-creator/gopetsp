import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSignedPhoto } from "@/components/PhotoChangeCard";
import { formatDateTime } from "@/lib/rides";

export const Route = createFileRoute("/admin/fotos")({
  head: () => ({
    meta: [
      { title: "Aprovação de fotos | Admin GoPet" },
      { name: "description", content: "Aprove ou recuse as novas fotos de tutores e motoristas da GoPet." },
      { property: "og:title", content: "Aprovação de fotos | Admin GoPet" },
      { property: "og:description", content: "Fila de fotos aguardando aprovação." },
    ],
  }),
  component: AdminPhotos,
});

function Thumb({ path }: { path: string | null }) {
  const url = useSignedPhoto(path);
  return url ? (
    <img src={url} alt="" className="size-24 rounded-xl object-cover" />
  ) : (
    <span className="flex size-24 items-center justify-center rounded-xl bg-secondary text-xs text-muted-foreground">
      Sem foto
    </span>
  );
}

function AdminPhotos() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-photos"],
    queryFn: async () => {
      const { data: reqs } = await supabase
        .from("photo_change_requests")
        .select("id, user_id, kind, file_path, created_at")
        .eq("status", "pending")
        .order("created_at");
      const ids = [...new Set((reqs ?? []).map((r) => r.user_id))];
      const [profiles, drivers] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        supabase.from("drivers").select("user_id, avatar_path").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      ]);
      const p = new Map((profiles.data ?? []).map((x) => [x.id, x]));
      const d = new Map((drivers.data ?? []).map((x) => [x.user_id, x.avatar_path]));
      return (reqs ?? []).map((r) => ({
        ...r,
        name: p.get(r.user_id)?.full_name || "Sem nome",
        current: r.kind === "driver" ? d.get(r.user_id) ?? null : p.get(r.user_id)?.avatar_url ?? null,
      }));
    },
  });

  const review = async (id: string, approve: boolean) => {
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt("Motivo da recusa (a pessoa verá esta mensagem):");
      if (!reason) return;
    }
    const { error } = await supabase.rpc("review_photo_change", { _id: id, _approve: approve, _reason: reason ?? undefined });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? "Foto aprovada." : "Foto recusada.");
    void qc.invalidateQueries({ queryKey: ["admin-photos"] });
  };

  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma foto aguardando aprovação.</p>;

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <Card key={r.id} className="shadow-soft">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <div className="text-center"><Thumb path={r.current} /><p className="mt-1 text-xs text-muted-foreground">Atual</p></div>
            <div className="text-center"><Thumb path={r.file_path} /><p className="mt-1 text-xs text-muted-foreground">Nova</p></div>
            <div className="min-w-40 flex-1">
              <p className="font-medium">{r.name}</p>
              <Badge variant="secondary">{r.kind === "driver" ? "Motorista" : "Tutor"}</Badge>
              <p className="mt-1 text-xs text-muted-foreground">Enviada em {formatDateTime(r.created_at)}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void review(r.id, true)}>Aprovar</Button>
              <Button variant="outline" onClick={() => void review(r.id, false)}>Recusar</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
