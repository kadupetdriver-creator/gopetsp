import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Copy, Loader2, PlusCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/rides";
import { isValidCPF, maskCPF } from "@/lib/drivers";
import { parseTopupCents } from "@/lib/topup";
import { getMercadoPagoPublicKey, type PaymentBrickData } from "@/lib/mercadopago.functions";
import { createTopupPayment, syncTopupPayment } from "@/lib/topup.functions";

const MercadoPagoPaymentBrick = lazy(() =>
  import("@/components/MercadoPagoPaymentBrick").then((m) => ({ default: m.MercadoPagoPaymentBrick })),
);

const QUICK = [2000, 5000, 10000, 20000];

type TopupRow = { id: string; status: string; amount_cents: number; qr_code: string | null; qr_code_base64: string | null; expires_at: string | null };

export function TopupPanel({ userId, email }: { userId: string; email?: string | undefined }) {
  const qc = useQueryClient();
  const createTopup = useServerFn(createTopupPayment);
  const syncTopup = useServerFn(syncTopupPayment);
  const [amountText, setAmountText] = useState("50,00");
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);
  const [cpf, setCpf] = useState("");
  const [topupId, setTopupId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const amountCents = parseTopupCents(amountText);

  const { data: pk } = useQuery({ queryKey: ["mercadopago-public-key"], queryFn: () => getMercadoPagoPublicKey() });
  const publicKey = pk && "publicKey" in pk ? pk.publicKey : undefined;

  const { data: topup } = useQuery({
    queryKey: ["topup", topupId], enabled: !!topupId,
    queryFn: async () => {
      const { data, error } = await supabase.from("mercadopago_topups")
        .select("id, status, amount_cents, qr_code, qr_code_base64, expires_at").eq("id", topupId ?? "").maybeSingle();
      if (error) throw error;
      return data as TopupRow | null;
    },
  });

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["topup", topupId] }),
      qc.invalidateQueries({ queryKey: ["credit-balance"] }),
      qc.invalidateQueries({ queryKey: ["credit-transactions"] }),
    ]);
  };

  useEffect(() => {
    if (!topupId) return;
    const ch = supabase.channel(`topup-${topupId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mercadopago_topups", filter: `id=eq.${topupId}` }, () => { void refreshAll(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupId, userId]);

  useEffect(() => {
    if (!topup?.expires_at) return;
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(topup.expires_at ?? "").getTime() - Date.now()) / 1000)));
    update();
    const t = window.setInterval(update, 1000);
    return () => window.clearInterval(t);
  }, [topup?.expires_at]);

  // Reforço: consulta a cada 5s por até 2 min enquanto aguarda confirmação.
  useEffect(() => {
    if (!topupId || !topup || !["pending", "in_process"].includes(topup.status)) return;
    let n = 0;
    const timer = window.setInterval(async () => {
      n += 1;
      try { const r = await syncTopup({ data: { topupId } }); if (r.paid || r.status !== "pending") await refreshAll(); } catch { /* nova tentativa */ }
      if (n >= 24) window.clearInterval(timer);
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupId, topup?.status]);

  const countdown = useMemo(() => `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`, [secondsLeft]);

  const reset = () => { setTopupId(null); setConfirmedAmount(null); setFormError(null); };

  const submit = async (brickData: PaymentBrickData) => {
    if (!confirmedAmount) throw new Error("Valor inválido");
    setSubmitting(true); setFormError(null);
    try {
      const r = await createTopup({ data: { amountCents: confirmedAmount, cpf, brickData } });
      if ("error" in r) { setFormError(r.error); toast.error(r.error); throw new Error(r.error); }
      setTopupId(r.topupId);
      if (r.status === "approved") { toast.success("Saldo adicionado!"); await refreshAll(); }
      else if (r.qrCode) toast.success("Pix gerado. Pague em até 30 minutos.");
      else if (r.status === "rejected") { setFormError("Pagamento recusado. Tente outra forma de pagamento."); setTopupId(null); }
    } finally { setSubmitting(false); }
  };

  const status = topup?.status;
  const showPix = Boolean(topup?.qr_code && status === "pending" && secondsLeft > 0);

  return (
    <Card className="shadow-soft border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><PlusCircle className="size-5 text-primary" /> Adicionar saldo</CardTitle>
        <CardDescription>Escolha o valor e pague com Pix ou cartão de crédito pelo Mercado Pago.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "approved" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-9 text-success" />
            <p className="font-semibold">{formatBRL(topup?.amount_cents ?? 0)} adicionados ao seu saldo</p>
            <Button variant="secondary" onClick={reset}>Fazer outra recarga</Button>
          </div>
        ) : showPix ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Escaneie ou copie o código. O saldo entra assim que o pagamento for confirmado.</p>
            {topup?.qr_code_base64 && <img className="mx-auto size-60" src={`data:image/png;base64,${topup.qr_code_base64}`} alt="QR Code Pix" />}
            <div className="flex items-center justify-center gap-2 font-semibold"><Clock3 className="size-4" /> Expira em {countdown}</div>
            <div className="flex gap-2">
              <Input readOnly value={topup?.qr_code ?? ""} aria-label="Código Pix copia e cola" />
              <Button size="icon" variant="outline" title="Copiar código Pix" onClick={async () => { await navigator.clipboard.writeText(topup?.qr_code ?? ""); toast.success("Código Pix copiado."); }}><Copy className="size-4" /></Button>
            </div>
            <Button variant="link" onClick={reset}>Cancelar e escolher outro valor</Button>
          </div>
        ) : topupId && status && ["pending", "in_process"].includes(status) ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm"><Loader2 className="size-4 animate-spin" /> Aguardando confirmação do pagamento…</p>
        ) : !confirmedAmount ? (
          <>
            {topupId && status && <p className="text-sm text-destructive">{status === "expired" ? "O Pix expirou." : "Pagamento não concluído."} Tente novamente.</p>}
            <div className="grid grid-cols-4 gap-2">
              {QUICK.map((c) => (
                <Button key={c} type="button" variant={amountCents === c ? "default" : "outline"} size="sm" onClick={() => setAmountText((c / 100).toFixed(2).replace(".", ","))}>
                  {formatBRL(c).replace(",00", "")}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor-recarga">Valor da recarga (R$)</Label>
              <Input id="valor-recarga" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="50,00" />
              <p className="text-xs text-muted-foreground">Mínimo R$ 10,00 e máximo R$ 2.000,00.</p>
            </div>
            <Button className="w-full" disabled={!amountCents} onClick={() => { setTopupId(null); setConfirmedAmount(amountCents); }}>
              Continuar com {amountCents ? formatBRL(amountCents) : "—"}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span>Recarga de <strong>{formatBRL(confirmedAmount)}</strong></span>
              <Button variant="link" className="h-auto p-0" onClick={reset} disabled={submitting}>Alterar</Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf-recarga">CPF do pagador</Label>
              <Input id="cpf-recarga" inputMode="numeric" maxLength={14} value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" />
            </div>
            {!isValidCPF(cpf) && <p className="text-sm text-muted-foreground">Digite o CPF para liberar as formas de pagamento.</p>}
            {publicKey && isValidCPF(cpf) && (
              <Suspense fallback={<Skeleton className="h-80 w-full" />}>
                <MercadoPagoPaymentBrick key={confirmedAmount} publicKey={publicKey} amountCents={confirmedAmount} {...(email ? { email } : {})} cpf={cpf.replace(/\D/g, "")} onSubmit={submit} onError={(m) => { setSubmitting(false); setFormError(m); toast.error(m); }} />
              </Suspense>
            )}
            {submitting && <p className="flex items-center justify-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Processando pagamento…</p>}
          </>
        )}
        {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Pagamento seguro. A GoPet não armazena dados do cartão.</p>
      </CardContent>
    </Card>
  );
}
