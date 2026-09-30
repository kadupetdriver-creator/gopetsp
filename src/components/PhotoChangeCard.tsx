import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const BUCKET = "driver-documents";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function useSignedPhoto(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!path) return;
    void supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
}

function Avatar({ path, label }: { path: string | null | undefined; label: string }) {
  const url = useSignedPhoto(path);
  return url ? (
    <img src={url} alt={label} className="size-20 rounded-2xl object-cover" />
  ) : (
    <span className="flex size-20 items-center justify-center rounded-2xl bg-primary/10 text-primary-ink">
      <UserRound className="size-8" />
    </span>
  );
}

/** Foto de perfil do tutor ou do motorista: a troca só vale após aprovação do administrador. */
export function PhotoChangeCard({ userId, kind }: { userId: string; kind: "tutor" | "driver" }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const key = ["photo-change", kind, userId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const current =
        kind === "driver"
          ? (await supabase.from("drivers").select("avatar_path").eq("user_id", userId).maybeSingle()).data?.avatar_path ?? null
          : (await supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle()).data?.avatar_url ?? null;
      const { data: last } = await supabase
        .from("photo_change_requests")
        .select("id, file_path, status, rejection_reason")
        .eq("user_id", userId)
        .eq("kind", kind)
        .neq("status", "replaced")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { current, last };
    },
  });

  const submit = useMutation({
    mutationFn: async (file: File) => {
      const ext = EXT[file.type];
      if (!ext) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
      if (file.size > 5 * 1024 * 1024) throw new Error("A foto deve ter no máximo 5 MB.");
      const path = `${userId}/${kind}-foto-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) throw new Error("Não foi possível enviar a foto. Tente novamente.");
      const { error } = await supabase.rpc("submit_photo_change", { _kind: kind, _path: path });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Foto enviada! Ela aparece depois da aprovação do administrador.");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível enviar a foto."),
  });

  const pending = data?.last?.status === "pending";
  const rejected = data?.last?.status === "rejected";

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">{kind === "driver" ? "Foto de motorista" : "Minha foto"}</CardTitle>
        <CardDescription>
          Você pode trocar quando quiser. A nova foto passa por aprovação do administrador; até lá, fica a atual.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="text-center">
          <Avatar path={data?.current} label="Foto atual" />
          <p className="mt-1 text-xs text-muted-foreground">Atual</p>
        </div>
        {pending && (
          <div className="text-center">
            <Avatar path={data?.last?.file_path} label="Foto em análise" />
            <Badge variant="secondary" className="mt-1">Em análise</Badge>
          </div>
        )}
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Nova foto"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) submit.mutate(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" disabled={submit.isPending} onClick={() => inputRef.current?.click()}>
            {submit.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Camera className="mr-2 size-4" />}
            {pending ? "Enviar outra foto" : "Trocar foto"}
          </Button>
          {rejected && (
            <p className="text-sm text-destructive">
              Última foto recusada: {data?.last?.rejection_reason}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
