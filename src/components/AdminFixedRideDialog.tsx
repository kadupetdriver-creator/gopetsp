import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Checkbox } from "./ui/checkbox";

export function AdminFixedRideDialog({ tutors, onClose, onSaved }: {
  tutors: { id: string; full_name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const create = useServerFn(adminCreateFixedRide);
  const [requestId] = useState(() => crypto.randomUUID());
  const [tutorId, setTutorId] = useState("");
  const [petIds, setPetIds] = useState<string[]>([]);
  const [stops, setStops] = useState<{ id: string; text: string; place: SelectedPlace | null }[]>([]);
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
      const selectedStops = stops.map((stop) => {
        if (!stop.place) throw new Error("Escolha o endereço de todas as paradas na lista de sugestões.");
        return stop.place;
      });
      return create({ data: { requestId, tutorId, petIds, stops: selectedStops, price, scheduledAt, origin, destination, accompanies, peopleCount: accompanies ? Number(people) : null, notes } });
    },
    onSuccess: () => { toast.success("Corrida fixa criada. O tutor já pode realizar o pagamento."); onSaved(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível criar a corrida fixa."),
  });
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Corrida fixa</DialogTitle><DialogDescription>Preço total definido pela administração · pagamento pendente</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="fixed-tutor">Tutor</Label><Select value={tutorId} onValueChange={(value) => { setTutorId(value); setPetIds([]); }}><SelectTrigger id="fixed-tutor"><SelectValue placeholder="Selecionar tutor" /></SelectTrigger><SelectContent>{tutors.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent></Select></div>
          <fieldset className="space-y-2 sm:col-span-2"><legend className="text-sm font-medium">Pets ({petIds.length}/3)</legend>{pets.isLoading && tutorId && <p className="text-xs text-muted-foreground">Carregando…</p>}{pets.data?.map((p) => <div key={p.id} className="flex items-center gap-2"><Checkbox id={`fixed-pet-${p.id}`} checked={petIds.includes(p.id)} disabled={!petIds.includes(p.id) && petIds.length >= 3} onCheckedChange={(checked) => setPetIds((ids) => checked === true ? [...ids, p.id] : ids.filter((id) => id !== p.id))} /><Label htmlFor={`fixed-pet-${p.id}`}>{p.name}</Label></div>)}{pets.isError && <p className="text-xs text-destructive">Não foi possível carregar os pets.</p>}{tutorId && !pets.isLoading && !pets.isError && pets.data?.length === 0 && <p className="text-xs text-muted-foreground">Este tutor ainda não tem pets cadastrados.</p>}</fieldset>
          <div className="space-y-2"><Label htmlFor="fixed-price">Preço fixo (R$)</Label><Input id="fixed-price" inputMode="decimal" placeholder="0,00" required value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="fixed-date">Data e horário (São Paulo)</Label><Input id="fixed-date" type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
        </div>
        <AddressAutocomplete label="Origem" value={originText} onValueChange={setOriginText} onSelect={setOrigin} place={origin} required />
        <div className="space-y-3">
          {stops.map((stop, index) => <div key={stop.id} className="space-y-2 border-l-2 border-border pl-3">
            <AddressAutocomplete label={`Parada ${index + 1}`} value={stop.text} onValueChange={(text) => setStops((items) => items.map((item) => item.id === stop.id ? { ...item, text } : item))} onSelect={(place) => setStops((items) => items.map((item) => item.id === stop.id ? { ...item, place } : item))} place={stop.place} required />
            <div className="flex gap-1">
              <Button type="button" size="icon" variant="ghost" title="Mover parada para cima" aria-label={`Mover parada ${index + 1} para cima`} disabled={index === 0} onClick={() => setStops((items) => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}><ArrowUp className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" title="Mover parada para baixo" aria-label={`Mover parada ${index + 1} para baixo`} disabled={index === stops.length - 1} onClick={() => setStops((items) => { const next = [...items]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}><ArrowDown className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" title="Remover parada" aria-label={`Remover parada ${index + 1}`} onClick={() => setStops((items) => items.filter((item) => item.id !== stop.id))}><Trash2 className="size-4" /></Button>
            </div>
          </div>)}
          <Button type="button" variant="outline" disabled={stops.length >= 3} onClick={() => setStops((items) => [...items, { id: crypto.randomUUID(), text: "", place: null }])}><Plus className="mr-2 size-4" />Adicionar parada</Button>
        </div>
        <AddressAutocomplete label="Destino" value={destinationText} onValueChange={setDestinationText} onSelect={setDestination} place={destination} required />
        <div className="flex items-center justify-between gap-3"><Label htmlFor="fixed-accompanies">Tutor acompanha o pet</Label><Switch id="fixed-accompanies" checked={accompanies} onCheckedChange={setAccompanies} /></div>
        {accompanies && <div className="space-y-2"><Label htmlFor="fixed-people">Quantidade de pessoas (incluindo o tutor)</Label><Input id="fixed-people" type="number" min={1} step={1} required value={people} onChange={(e) => setPeople(e.target.value)} /></div>}
        <div className="space-y-2"><Label htmlFor="fixed-notes">Observações</Label><Textarea id="fixed-notes" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <DialogFooter><Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={save.isPending || !tutorId || petIds.length === 0}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Criar corrida fixa</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}