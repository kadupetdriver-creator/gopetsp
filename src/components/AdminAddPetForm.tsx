import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminAddTutorPet } from "@/lib/admin-tutors.functions";
import { petSizes, petSpecies } from "@/lib/rides";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PetSizeHelp } from "@/components/PetSizeHelp";

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Não foi possível ler a foto."));
    r.readAsDataURL(file);
  });
}

export function AdminAddPetForm({ tutorId, onAdded }: { tutorId: string; onAdded: () => void }) {
  const add = useServerFn(adminAddTutorPet);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [size, setSize] = useState<string>(petSizes[0].value);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (): Promise<void> => {
    if (!name.trim()) { toast.error("Informe o nome do pet."); return; }
    if (!species) { toast.error("Selecione a espécie do pet."); return; }
    if (photo && photo.size > 5 * 1024 * 1024) { toast.error("A foto deve ter no máximo 5 MB."); return; }
    setBusy(true);
    try {
      const encoded = photo ? { base64: await toBase64(photo), type: photo.type } : null;
      await add({ data: { tutorId, name: name.trim(), species, size, photo: encoded } });
      toast.success("Pet cadastrado para o tutor.");
      setName(""); setSpecies(""); setPhoto(null);
      if (fileRef.current) fileRef.current.value = "";
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith("[") ? e.message : "Não foi possível cadastrar o pet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Adicionar pet</p>
        <PetSizeHelp />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Nome do pet" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={species} onValueChange={setSpecies}>
          <SelectTrigger className="w-full" aria-label="Espécie do pet"><SelectValue placeholder="Espécie" /></SelectTrigger>
          <SelectContent>{petSpecies.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={size} onValueChange={setSize}>
          <SelectTrigger className="w-full" aria-label="Porte do pet"><SelectValue /></SelectTrigger>
          <SelectContent>{petSizes.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          aria-label="Foto do pet" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="truncate">
          <Camera className="mr-2 size-4" />{photo ? photo.name : "Foto (opcional)"}
        </Button>
      </div>
      <Button type="button" className="w-full" disabled={busy} onClick={submit}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Adicionar pet
      </Button>
    </div>
  );
}
