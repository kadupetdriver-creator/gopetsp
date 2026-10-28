import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateFixedRide } from "@/lib/fixed-rides.functions";
import { saoPauloScheduleInput } from "@/lib/ride-reschedule";
import { AddressAutocomplete, type SelectedPlace } from "./AddressAutocomplete";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";

export function AdminFixedRideDialog({ tutors, onClose, onSaved }: {
  tutors: { id: string; full_name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const create = useServerFn(adminCreateFixedRide);
  const [requestId] = useState(() => crypto.randomUUID());
  const [tutorId, setTutorId] = useState("");
  const [petId, setPetId] = useState("");
  const [price, setPrice] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => saoPauloScheduleInput(new Date(Date.now() + 3600000).toISOString()));
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [origin, setOrigin] = useState<SelectedPlace | null>(null);
  const [destination, setDestination] = useState<SelectedPlace | null>(null);
  const [accompanies, setAccompanies] = useState(false);
  const [people, setPeople] = useState("1");
  const [notes, setNotes] = useState("");
  const pets = useQuery({
    queryKey: ["admin-fixed-ride-pets", tutorId], enabled: !!tutorId,
    queryFn: async () => {
      const { data, error } = await supabase.from("pets").select("id, name").eq("owner_id", tutorId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!origin || !destination) throw new Error("Escolha origem e destino na lista de sugestões.");
      return create({ data: { requestId, tutorId, petId, price, scheduledAt, origin, destination, accompanies, peopleCount: accompanies ? Number(people) : null, notes } });
    },
    onSuccess: () => { toast.success("Corrida fixa criada. O tutor já pode realizar o pagamento."); onSaved(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível criar a corrida fixa."),
  });
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Corrida fixa</DialogTitle><DialogDescription>Preço total definido pela administração · pagamento pendente</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="fixed-tutor">Tutor</Label><Select value={tutorId} onValueChange={(value) => { setTutorId(value); setPetId(""); }}><SelectTrigger id="fixed-tutor"><SelectValue placeholder="Selecionar tutor" /></SelectTrigger><SelectContent>{tutors.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="fixed-pet">Pet</Label><Select value={petId} onValueChange={setPetId} disabled={!tutorId || pets.isLoading}><SelectTrigger id="fixed-pet"><SelectValue placeholder={pets.isLoading ? "Carregando…" : "Selecionar pet"} /></SelectTrigger><SelectContent>{pets.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>{pets.isError && <p className="text-xs text-destructive">Não foi possível carregar os pets.</p>}{tutorId && !pets.isLoading && !pets.isError && pets.data?.length === 0 && <p className="text-xs text-muted-foreground">Este tutor ainda não tem pets cadastrados.</p>}</div>
          <div className="space-y-2"><Label htmlFor="fixed-price">Preço fixo (R$)</Label><Input id="fixed-price" inputMode="decimal" placeholder="0,00" required value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="fixed-date">Data e horário (São Paulo)</Label><Input id="fixed-date" type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
        </div>
        <AddressAutocomplete label="Origem" value={originText} onValueChange={setOriginText} onSelect={setOrigin} place={origin} required />
        <AddressAutocomplete label="Destino" value={destinationText} onValueChange={setDestinationText} onSelect={setDestination} place={destination} required />
        <div className="flex items-center justify-between gap-3"><Label htmlFor="fixed-accompanies">Tutor acompanha o pet</Label><Switch id="fixed-accompanies" checked={accompanies} onCheckedChange={setAccompanies} /></div>
        {accompanies && <div className="space-y-2"><Label htmlFor="fixed-people">Quantidade de pessoas (incluindo o tutor)</Label><Input id="fixed-people" type="number" min={1} step={1} required value={people} onChange={(e) => setPeople(e.target.value)} /></div>}
        <div className="space-y-2"><Label htmlFor="fixed-notes">Observações</Label><Textarea id="fixed-notes" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <DialogFooter><Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={save.isPending || !tutorId || !petId}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Criar corrida fixa</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}