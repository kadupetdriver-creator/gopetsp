import { useEffect, useState } from "react";
import { PawPrint } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type PetPhotoProps = {
  /** Caminho do arquivo no bucket pet-photos (pets.photo_url). */
  path?: string | null;
  petName: string;
  imgClassName: string;
  fallbackClassName: string;
  iconClassName?: string;
};

/**
 * Foto do pet a partir do bucket privado pet-photos: gera uma URL assinada
 * temporária. Sem foto (ou erro), mostra o ícone de pata.
 */
export function PetPhoto({ path, petName, imgClassName, fallbackClassName, iconClassName }: PetPhotoProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!path) return;
    if (path.startsWith("http")) {
      setUrl(path);
      return;
    }
    void supabase.storage
      .from("pet-photos")
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (!cancelled && !error && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (url) {
    return <img src={url} alt={`Foto de ${petName}`} loading="lazy" className={imgClassName} />;
  }
  return (
    <span className={fallbackClassName}>
      <PawPrint className={iconClassName ?? "size-5"} />
    </span>
  );
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Envia a foto do pet para o bucket privado e devolve o caminho salvo. */
export async function uploadPetPhoto(ownerId: string, petId: string, file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("A foto deve ter no máximo 5 MB.");
  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  const path = `${ownerId}/${petId}.${ext}`;
  const { error } = await supabase.storage.from("pet-photos").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw new Error("Não foi possível enviar a foto. Tente novamente.");
  return path;
}
