import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { requestPhoneCode, confirmPhoneCode } from "@/lib/phone.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  phone: string;
  verified: boolean;
  onPhoneChange: (value: string) => void;
  onVerified: () => void;
};

/** Confirmação do celular por código SMS, com estados pendente/verificado. */
export function PhoneVerification({ phone, verified, onPhoneChange, onVerified }: Props) {
  const askCode = useServerFn(requestPhoneCode);
  const sendCode = useServerFn(confirmPhoneCode);
  const [step, setStep] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingConfig, setPendingConfig] = useState(false);

  const handleRequest = async () => {
    setBusy(true);
    try {
      const result = await askCode({ data: { phone } });
      setStep("code");
      setPendingConfig(result.status === "sms_not_configured");
      toast.success(
        result.status === "sent"
          ? `Código enviado por SMS para ${result.phone}.`
          : "Código gerado, mas o envio de SMS ainda não está ativo.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o código.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await sendCode({ data: { code } });
      setStep("idle");
      setCode("");
      toast.success("Telefone verificado!");
      onVerified();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="tel">Celular (WhatsApp/SMS)</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="tel"
            inputMode="tel"
            placeholder="(11) 90000-0000"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
          />
          <Button
            type="button"
            variant={verified ? "outline" : "default"}
            disabled={busy || phone.replace(/\D/g, "").length < 10}
            onClick={handleRequest}
            className="sm:w-52"
          >
            {busy && step === "idle" && <Loader2 className="mr-2 size-4 animate-spin" />}
            {verified ? "Verificar outro número" : "Enviar código SMS"}
          </Button>
        </div>
      </div>

      <p
        className={`flex items-center gap-2 text-sm ${verified ? "text-success" : "text-muted-foreground"}`}
      >
        {verified ? <BadgeCheck className="size-4" /> : <ShieldAlert className="size-4" />}
        {verified ? "Telefone verificado" : "Telefone pendente de verificação"}
      </p>

      {step === "code" && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <Label htmlFor="codigo">Código de 6 dígitos</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="codigo"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <Button type="button" onClick={handleConfirm} disabled={busy || code.length !== 6} className="sm:w-52">
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Confirmar código
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O código expira em 10 minutos. São permitidas até 5 tentativas por código e 5 códigos por hora.
          </p>
          {pendingConfig && (
            <p className="text-xs text-warning-foreground">
              O envio real de SMS ainda não está ativo neste projeto — falta conectar um provedor de SMS.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
