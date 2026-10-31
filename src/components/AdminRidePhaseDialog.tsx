import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminChangeRidePhase } from "@/lib/admin-rides.functions";
import { adminRidePhase, adminRidePhases, type AdminRidePhase } from "@/lib/admin-rides";
import type { RideStatus } from "@/lib/rides";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AdminRidePhaseDialog({ ride, onClose }: {
  ride: { id: string; pet_name: string; status: RideStatus; arrived_at: string | null; updated_at: string };
  onClose: () => void;
}) {
  const currentPhase = adminRidePhase(ride);
  const [phase, setPhase] = useState<AdminRidePhase>(currentPhase ?? "en_route");
  const changePhase = useServerFn(adminChangeRidePhase);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => changePhase({ data: { rideId: ride.id, phase, expectedUpdatedAt: ride.updated_at } }),
    onSuccess: () => {
      toast.success(phase === "completed" ? "Corrida finalizada pela administração." : "Fase da corrida atualizada.");
      for (const key of ["admin-rides", "admin-report", "driver-rides", "rides", "ride", "my-rides", "ride-payment"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível alterar a fase."),
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar fase da corrida</DialogTitle>
          <DialogDescription>{ride.pet_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium" id="ride-phase-label">Fase</label>
          <Select value={phase} onValueChange={(value) => {
            const option = adminRidePhases.find((item) => item.value === value);
            if (option) setPhase(option.value);
          }} disabled={save.isPending}>
            <SelectTrigger aria-labelledby="ride-phase-label"><SelectValue /></SelectTrigger>
            <SelectContent>{adminRidePhases.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          {phase === "completed" && <p className="text-sm text-destructive">Confirma que o transporte terminou? A finalização não poderá ser desfeita.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={save.isPending} onClick={onClose}>Voltar</Button>
          <Button disabled={save.isPending || phase === currentPhase} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {phase === "completed" ? "Confirmar finalização" : "Confirmar fase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}