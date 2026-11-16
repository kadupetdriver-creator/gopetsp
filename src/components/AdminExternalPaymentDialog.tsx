import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminConfirmExternalRidePayment } from "@/lib/admin-rides.functions";
import { formatBRL } from "@/lib/rides";
import { formatSaoPauloSchedule } from "@/lib/ride-reschedule";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function AdminExternalPaymentDialog({ ride, tutorName, onClose, onSaved }: {
  ride: { id: string; pet_name: string; price_cents: number; scheduled_at: string; updated_at: string };
  tutorName: string; onClose: () => void; onSaved: () => void;
}) {
  const confirmPayment = useServerFn(adminConfirmExternalRidePayment);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const save = useMutation({
    mutationFn: () => confirmPayment({ data: { rideId: ride.id, expectedUpdatedAt: ride.updated_at, note, confirmed } }),
    onSuccess: () => { toast.success("Pagamento externo confirmado. Corrida marcada como paga."); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível confirmar o pagamento."),
  });
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Marcar como pago — Pix externo</DialogTitle>
        <DialogDescription>{tutorName} · {ride.pet_name} · {formatSaoPauloSchedule(ride.scheduled_at)}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <p className="text-lg font-semibold">Valor recebido: {formatBRL(ride.price_cents)}</p>
        <p className="text-sm text-muted-foreground">Não haverá nova cobrança nem débito do saldo GoPet. O motorista não será chamado automaticamente. Eventual devolução deste Pix deverá ser feita fora da plataforma.</p>
        <div className="space-y-2"><label htmlFor="external-payment-note" className="text-sm font-medium">Observação ou referência do Pix</label><Textarea id="external-payment-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} disabled={save.isPending} placeholder="Informe como o recebimento foi conferido" /></div>
        <div className="flex items-start gap-2"><Checkbox id="external-payment-confirmed" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} disabled={save.isPending} /><label htmlFor="external-payment-confirmed" className="text-sm">Conferi o recebimento integral deste valor via Pix fora da plataforma.</label></div>
        {save.isError && <p role="alert" className="text-sm text-destructive">{save.error instanceof Error ? save.error.message : "Não foi possível confirmar."}</p>}
      </div>
      <DialogFooter><Button variant="ghost" disabled={save.isPending} onClick={onClose}>Voltar</Button><Button disabled={!confirmed || note.trim().length < 5 || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}Confirmar pagamento externo</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}