import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Calculator, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocomplete, type SelectedPlace } from "@/components/AddressAutocomplete";
import { PetSizeHelp } from "@/components/PetSizeHelp";
import { petSizes, serviceTypes, formatBRL } from "@/lib/rides";
import { quoteDriverRide } from "@/lib/driver-quote.functions";
import { driverQuoteSchema } from "@/lib/driver-quote";

type AddressField = { text: string; place: SelectedPlace | null };
type Draft = {
  sizes: string[]; origin: AddressField; destination: AddressField; stops: AddressField[];
  scheduled: string; returnAt: string; trunk: boolean | null; hasReturn: boolean | null;
  waits: boolean | null; accompanies: boolean | null; people: string; service: string; notes: string;
};
function initialDraft(): Draft {
  const date = new Date(Date.now() + 3600000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return { sizes: ["medio"], origin: { text: "", place: null }, destination: { text: "", place: null }, stops: [], scheduled: local, returnAt: "", trunk: null, hasReturn: null, waits: null, accompanies: null, people: "", service: "veterinario", notes: "" };
}

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><RadioGroup aria-label={label} value={value === null ? "" : value ? "sim" : "nao"} onValueChange={(v) => onChange(v === "sim")} className="flex gap-6" required>
    {[{ text: "Sim", value: "sim" }, { text: "Não", value: "nao" }].map((option) => <label key={option.value} className="flex items-center gap-2 text-sm"><RadioGroupItem value={option.value} />{option.text}</label>)}
  </RadioGroup></div>;
}

export function DriverQuoteDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState("");
  const calculate = useServerFn(quoteDriverRide);
  const quote = useMutation({ mutationFn: calculate });
  const key = `gopet:driver-quote:${userId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && Array.isArray(saved.sizes) && Array.isArray(saved.stops) && saved.origin && saved.destination) setDraft({ ...initialDraft(), ...saved });
    } catch { /* Ignore damaged drafts. */ }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify(draft)); } catch { /* Storage unavailable. */ }
  }, [draft, key, ready]);
  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    quote.reset();
    setValidation("");
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.origin.place || !draft.destination.place || draft.stops.some((stop) => !stop.place)) { setValidation("Escolha todos os endereços nas sugestões."); return; }
    if (draft.trunk === null || draft.hasReturn === null || draft.accompanies === null || (draft.hasReturn && draft.waits === null)) { setValidation("Responda às opções de porta-malas, acompanhamento, retorno e espera."); return; }
    if (draft.accompanies && (!Number.isSafeInteger(Number(draft.people)) || Number(draft.people) < 1)) { setValidation("Informe quantas pessoas vão, incluindo o tutor."); return; }
    const departure = new Date(draft.scheduled);
    const returnDate = new Date(draft.returnAt);
    if (Number.isNaN(departure.getTime()) || (draft.hasReturn && Number.isNaN(returnDate.getTime()))) { setValidation("Informe a data e horário da ida e do retorno."); return; }
    const parsed = driverQuoteSchema.safeParse({ origin: draft.origin.place, destination: draft.destination.place, stops: draft.stops.flatMap((stop) => stop.place ? [stop.place] : []), petSizes: draft.sizes, needsTrunk: draft.trunk, scheduledAt: departure.toISOString(), hasReturn: draft.hasReturn, returnScheduledAt: draft.hasReturn ? returnDate.toISOString() : null, driverWaits: draft.waits === true });
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Confira os campos do orçamento."); return; }
    quote.mutate({ data: parsed.data });
  }
  function address(field: AddressField, label: string, onChange: (field: AddressField) => void) {
    return <AddressAutocomplete label={label} value={field.text} place={field.place} onValueChange={(text) => onChange({ ...field, text })} onSelect={(place) => onChange({ text: place?.address ?? field.text, place })} required />;
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button><Calculator className="mr-2 size-4" />Criar orçamento</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Criar orçamento</DialogTitle></DialogHeader>
      <form className="space-y-6" onSubmit={submit}>
        <section className="space-y-3">
          <div className="flex items-center gap-2"><h2 className="font-semibold">Sobre os pets</h2><PetSizeHelp /></div>
          {draft.sizes.map((size, index) => <div key={index} className="flex items-center gap-2">
            <Select value={size} onValueChange={(value) => update({ sizes: draft.sizes.map((s, i) => i === index ? value : s) })}>
              <SelectTrigger className="min-w-0 flex-1" aria-label={`Porte do pet ${index + 1}`}><SelectValue /></SelectTrigger>
              <SelectContent>{petSizes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            {draft.sizes.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label={`Remover pet ${index + 1}`} onClick={() => update({ sizes: draft.sizes.filter((_, i) => i !== index) })}><X className="size-4" /></Button>}
          </div>)}
          {draft.sizes.length < 3 && <Button type="button" variant="outline" onClick={() => update({ sizes: [...draft.sizes, "medio"] })}><Plus className="mr-2 size-4" />Adicionar pet</Button>}
          <Label>Motivo da viagem</Label><Select value={draft.service} onValueChange={(service) => update({ service })}><SelectTrigger aria-label="Motivo da viagem"><SelectValue /></SelectTrigger><SelectContent>{serviceTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        </section>
        <section className="space-y-4">
          <h2 className="font-semibold">Trajeto</h2>
          {address(draft.origin, "Endereço de embarque", (origin) => update({ origin }))}
          {draft.stops.map((stop, index) => <div key={index} className="flex items-end gap-2"><div className="min-w-0 flex-1">{address(stop, `Parada ${index + 1}`, (value) => update({ stops: draft.stops.map((s, i) => i === index ? value : s) }))}</div><Button type="button" variant="outline" size="icon" aria-label={`Remover parada ${index + 1}`} onClick={() => update({ stops: draft.stops.filter((_, i) => i !== index) })}><X className="size-4" /></Button></div>)}
          {draft.stops.length < 3 && <Button type="button" variant="outline" onClick={() => update({ stops: [...draft.stops, { text: "", place: null }] })}><Plus className="mr-2 size-4" />Adicionar parada no trajeto</Button>}
          {address(draft.destination, "Endereço de destino", (destination) => update({ destination }))}
          <div className="space-y-2"><Label htmlFor="quote-date">Data e horário</Label><Input id="quote-date" type="datetime-local" value={draft.scheduled} onChange={(event) => update({ scheduled: event.target.value })} required /></div>
          <YesNo label="Utilizar porta-malas?" value={draft.trunk} onChange={(trunk) => update({ trunk })} />
          <YesNo label="O tutor vai acompanhar o pet?" value={draft.accompanies} onChange={(accompanies) => update({ accompanies, people: accompanies ? draft.people : "" })} />
          {draft.accompanies && <div className="space-y-2"><Label htmlFor="quote-people">Quantas pessoas vão, incluindo o tutor?</Label><Input id="quote-people" type="number" min={1} step={1} value={draft.people} onChange={(event) => update({ people: event.target.value })} required /></div>}
          <YesNo label="Haverá corrida de retorno?" value={draft.hasReturn} onChange={(hasReturn) => update({ hasReturn, waits: null, returnAt: "" })} />
          {draft.hasReturn && <><div className="space-y-2"><Label htmlFor="quote-return">Data e horário do retorno</Label><Input id="quote-return" type="datetime-local" min={draft.scheduled} value={draft.returnAt} onChange={(event) => update({ returnAt: event.target.value })} required /></div><YesNo label="O motorista aguarda até o retorno?" value={draft.waits} onChange={(waits) => update({ waits })} /></>}
          <div className="space-y-2"><Label htmlFor="quote-notes">Observações</Label><Textarea id="quote-notes" value={draft.notes} onChange={(event) => update({ notes: event.target.value })} /></div>
        </section>
        {(validation || quote.isError) && <p role="alert" className="text-sm text-destructive">{validation || (quote.error instanceof Error ? quote.error.message : "Não foi possível calcular o orçamento.")}</p>}
        <Button type="submit" className="w-full" disabled={quote.isPending || !ready}>{quote.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Calculator className="mr-2 size-4" />}Calcular orçamento</Button>
        {quote.data && <section aria-label="Resumo do orçamento" className="space-y-2 border-t border-border pt-4">
          <h2 className="font-semibold">Resumo do orçamento</h2>
          <p className="text-sm text-muted-foreground">{quote.data.distanceKm} km · aproximadamente {quote.data.durationMinutes} min · {quote.data.petCount} pet(s)</p>
          <div className="flex justify-between text-sm"><span>Ida</span><span>{formatBRL(quote.data.oneWayCents)}</span></div>
          {draft.hasReturn && <div className="flex justify-between text-sm"><span>Retorno</span><span>{formatBRL(quote.data.returnFeeCents)}</span></div>}
          {quote.data.waitingMinutes > 0 && <div className="flex justify-between text-sm"><span>Espera ({quote.data.waitingMinutes} min)</span><span>{formatBRL(quote.data.waitingFeeCents)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Valor estimado</span><span>{formatBRL(quote.data.priceCents)}</span></div>
        </section>}
      </form>
    </DialogContent>
  </Dialog>;
}