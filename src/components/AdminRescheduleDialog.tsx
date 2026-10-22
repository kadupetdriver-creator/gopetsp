import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminRescheduleRide } from "@/lib/admin-rides.functions";
import { formatSaoPauloSchedule, saoPauloScheduleInput } from "@/lib/ride-reschedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function AdminRescheduleDialog({ ride, onClose, onSaved }: {
  ride: { id: string; pet_name: string; scheduled_at: string };
  onClose: () => void; onSaved: () => void;
}) {
  const reschedule = useServerFn(adminRescheduleRide);
  const [scheduledAt, setScheduledAt] = useState(() => saoPauloScheduleInput(ride.scheduled_at));
  const [tutorRequested, setTutorRequested] = useState(false);
  const save = useMutation({
    mutationFn: () => reschedule({ data: { rideId: ride.id, scheduledAt, tutorRequested } }),
    onSuccess: () => { toast.success("Data da corrida alterada a pedido do tutor."); onSaved(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível alterar a data."),
  });
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Alterar data da corrida</DialogTitle><DialogDescription>{ride.pet_name} · Agendamento atual: {formatSaoPauloSchedule(ride.scheduled_at)}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><label htmlFor="reschedule-date" className="text-sm font-medium">Nova data e horário (São Paulo)</label><Input id="reschedule-date" type="datetime-local" value={scheduledAt} disabled={save.isPending} onChange={(e) => setScheduledAt(e.target.value)} required /></div>
        <div className="flex items-center gap-2"><Checkbox id="tutor-requested-reschedule" checked={tutorRequested} disabled={save.isPending} onCheckedChange={(value) => setTutorRequested(value === true)} /><label htmlFor="tutor-requested-reschedule" className="text-sm">O tutor solicitou esta alteração</label></div>
        {save.isError && <p role="alert" className="text-sm text-destructive">{save.error instanceof Error ? save.error.message : "Não foi possível alterar a data."}</p>}
      </div>
      <DialogFooter><Button variant="ghost" disabled={save.isPending} onClick={onClose}>Voltar</Button><Button disabled={!scheduledAt || !tutorRequested || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}Confirmar nova data</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}