import { CalendarX2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CANCELLATION_FEES_ACTIVE } from "@/lib/cancellation-policy";

export function CancellationPolicyNotice({ accepted, onAcceptedChange }: { accepted: boolean; onAcceptedChange: (v: boolean) => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-primary/60 bg-foreground p-3 text-sm text-background">
      <p className="flex items-center gap-2 font-semibold text-primary">
        <CalendarX2 className="size-4" /> Condições de cancelamento
      </p>
      <ul className="space-y-1 text-xs">
        <li>• Mais de 5 dias (120 h) antes: <b>gratuito</b>.</li>
        <li>• De 5 dias antes até o dia da corrida: <b>taxa de 30%</b>.</li>
        <li>• Motorista já a caminho ou no local: <b>taxa de 50%</b>.</li>
        <li>• As taxas não se somam. Sem taxa em caso de falha da GoPet ou do motorista.</li>
      </ul>
      {!CANCELLATION_FEES_ACTIVE && (
        <p className="text-xs text-primary">Política em fase de testes e revisão jurídica: as taxas ainda não são cobradas.</p>
      )}
      <label className="flex items-start gap-2 pt-1 text-xs">
        <Checkbox checked={accepted} onCheckedChange={(v) => onAcceptedChange(v === true)} className="mt-0.5 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground" />
        <span>Li e concordo com as condições de cancelamento.</span>
      </label>
    </div>
  );
}
