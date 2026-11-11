import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cancelRideAsTutor, quoteTutorCancellation } from "@/lib/cancellation.functions";
import { refundRidePayment } from "@/lib/payments.functions";
import { tierLabels } from "@/lib/cancellation-policy";
import { formatBRL } from "@/lib/rides";

export function TutorCancelRideButton({ rideId, size, onDone }: { rideId: string; size?: "sm" | "default"; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const quoteFn = useServerFn(quoteTutorCancellation);
  const cancelFn = useServerFn(cancelRideAsTutor);
  const refundFn = useServerFn(refundRidePayment);
  const quote = useQuery({
    queryKey: ["cancel-quote", rideId],
    queryFn: () => quoteFn({ data: { rideId } }),
    enabled: open, staleTime: 0, gcTime: 0,
  });
  const cancel = useMutation({
    mutationFn: async () => {
      await cancelFn({ data: { rideId, reason: reason.trim() || undefined, confirmed: true } });
      // Fluxo financeiro inalterado nesta etapa: mantém o reembolso atual.
      const r = await refundFn({ data: { rideId } });
      return "error" in r ? null : r.status;
    },
    onSuccess: (status) => {
      toast.success(status === "refunded" ? "Corrida cancelada. O reembolso foi solicitado." : "Corrida cancelada.");
      setOpen(false); onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível cancelar."),
  });
  const q = quote.data;
  return (
    <>
      <Button variant="outline" size={size} onClick={() => { setConfirmed(false); setOpen(true); }}>Cancelar corrida</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-primary/60">
          <DialogHeader>
            <DialogTitle>Cancelar corrida?</DialogTitle>
            <DialogDescription>Confira a taxa antes de confirmar.</DialogDescription>
          </DialogHeader>
          {quote.isLoading && <Loader2 className="mx-auto size-6 animate-spin" />}
          {quote.error && <p className="text-sm text-destructive">{(quote.error as Error).message}</p>}
          {q && (
            <div className="space-y-3">
              <div className="rounded-xl bg-foreground p-4 text-sm text-background">
                <p className="font-semibold text-primary">{tierLabels[q.tier]}</p>
                <dl className="mt-2 grid grid-cols-2 gap-1">
                  <dt>Valor da corrida</dt><dd className="text-right">{formatBRL(q.priceCents)}</dd>
                  <dt>Taxa ({q.ratePercent}%)</dt><dd className="text-right">{formatBRL(q.feeCents)}</dd>
                  <dt className="font-semibold">Reembolso previsto</dt><dd className="text-right font-semibold text-primary">{formatBRL(q.refundCents)}</dd>
                </dl>
              </div>
              {!q.feesActive && q.paid && (
                <p className="text-xs text-muted-foreground">Política em fase de testes: nesta etapa a taxa ainda não é cobrada e o reembolso segue integral.</p>
              )}
              <Textarea placeholder="Motivo do cancelamento (opcional)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                <span>Estou ciente da taxa e quero cancelar esta corrida.</span>
              </label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Voltar</Button>
            <Button variant="destructive" disabled={!q || !confirmed || cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Sim, cancelar corrida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CancellationHistoryLine({ c }: { c: { cancelled_at: string; rate_percent: number; fee_cents: number; refund_cents: number; reason: string | null } }) {
  const when = new Date(c.cancelled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <p className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-sm">
      Cancelada em {when} — taxa {c.rate_percent}% ({formatBRL(c.fee_cents)}), reembolso previsto {formatBRL(c.refund_cents)}
      {c.reason ? ` · Motivo: ${c.reason}` : ""}
    </p>
  );
}
