import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { expectedDriverPaymentDate } from "@/lib/driver-payments";
import { adminRecordDriverPayment } from "@/lib/driver-payments.functions";
import { formatBRL } from "@/lib/rides";
import { formatSaoPauloSchedule, saoPauloScheduleInput } from "@/lib/ride-reschedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export const driverPaymentRowClass = (paidAt: string | null | undefined) => paidAt ? "border-l-4 border-l-success bg-success/10" : "border-l-4 border-l-warning bg-warning/10";

export function DriverPaymentStatus({ rideId, scheduledAt, paidAt, amountCents, admin = false, completed = false }: {
  rideId: string; scheduledAt: string; paidAt?: string | null; amountCents: number; admin?: boolean; completed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const record = useServerFn(adminRecordDriverPayment);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => record({ data: { rideId, paidAt: date } }),
    onSuccess: () => {
      toast.success("Pagamento ao motorista registrado."); setOpen(false);
      for (const key of ["admin-report", "admin-weekly-earnings", "driver-ride-payments"]) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível registrar o pagamento."),
  });
  const expected = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(expectedDriverPaymentDate(scheduledAt)));
  return <>
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <p className={paidAt ? "text-success font-medium" : "text-warning-foreground font-medium"}>
        {paidAt ? `Pago ao motorista em ${formatSaoPauloSchedule(paidAt)}` : `A pagar ao motorista · Previsto: ${expected}${completed ? "" : " · Após conclusão"}`}
      </p>
      {admin && completed && !paidAt && <Button size="sm" variant="outline" onClick={() => { setDate(saoPauloScheduleInput(new Date().toISOString())); setOpen(true); }}><CheckCircle2 className="size-4" />Registrar pagamento</Button>}
    </div>
    <Dialog open={open} onOpenChange={(value) => { if (!save.isPending) setOpen(value); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar pagamento ao motorista</DialogTitle><DialogDescription>Confirme somente após pagar {formatBRL(amountCents)} ao motorista. Este registro não realiza uma transferência.</DialogDescription></DialogHeader>
        <label htmlFor={`driver-payment-${rideId}`} className="text-sm font-medium">Data e hora do pagamento (São Paulo)</label>
        <Input id={`driver-payment-${rideId}`} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} disabled={save.isPending} max={saoPauloScheduleInput(new Date().toISOString())} />
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)} disabled={save.isPending}>Voltar</Button><Button onClick={() => save.mutate()} disabled={!date || save.isPending}>{save.isPending ? "Salvando…" : "Confirmar pagamento realizado"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}