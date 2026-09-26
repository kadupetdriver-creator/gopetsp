import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Copy, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/rides";
import { isValidCPF, maskCPF } from "@/lib/drivers";
import { createMercadoPagoPayment, getMercadoPagoPublicKey, syncMercadoPagoPayment, type PaymentBrickData } from "@/lib/mercadopago.functions";

const MercadoPagoPaymentBrick = lazy(() =>
  import("@/components/MercadoPagoPaymentBrick").then((module) => ({ default: module.MercadoPagoPaymentBrick })),
);

type PaymentRow = {
  id: string;
  status: string;
  status_detail: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
  expires_at: string | null;
};

const statusMessage: Record<string, string> = {
  approved: "Pagamento recebido. Aguardando a confirmação segura do Mercado Pago.",
  pending: "Aguardando o pagamento.",
  in_process: "Pagamento em análise.",
  rejected: "Pagamento recusado. Confira os dados ou tente outra forma de pagamento.",
  cancelled: "Pagamento cancelado. Faça uma nova tentativa.",
  expired: "O Pix expirou. Gere um novo código para pagar.",
  refunded: "Pagamento reembolsado.",
};

export const Route = createFileRoute("/pagamento/$rideId")({
  head: () => ({
    meta: [
      { title: "Pagamento da corrida | GoPet" },
      { name: "description", content: "Pague sua corrida GoPet por crédito, débito ou Pix em um checkout seguro." },
      { property: "og:title", content: "Pagamento da corrida | GoPet" },
      { property: "og:description", content: "Checkout seguro da corrida GoPet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PagamentoCorrida,
});

function PagamentoCorrida() {
  const { rideId } = Route.useParams();
  const { user } = useRoleGuard("tutor");
  const qc = useQueryClient();
  const createPayment = useServerFn(createMercadoPagoPayment);
  const [couponId, setCouponId] = useState<string | null>(null);
  const { data: coupons = [] } = useQuery({
    queryKey: ["my-coupons-available"],
    queryFn: async () => {
      const { data } = await supabase.from("referral_coupons").select("id, code, discount_percent").eq("status", "available").order("created_at");
      return data ?? [];
    },
  });
  const syncPayment = useServerFn(syncMercadoPagoPayment);
  const [cpf, setCpf] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const { data: ride, isLoading } = useQuery({
    queryKey: ["ride-payment", rideId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("rides")
        .select("id, pet_name, origin_address, destination_address, price_cents, distance_km, paid_at, return_of_ride_id")
        .eq("id", rideId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: returnRide } = useQuery({
    queryKey: ["ride-return-pair", rideId], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("rides").select("id, price_cents").eq("return_of_ride_id", rideId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: publicKeyResult } = useQuery({
    queryKey: ["mercadopago-public-key"], queryFn: () => getMercadoPagoPublicKey(),
  });
  const publicKey = publicKeyResult && "publicKey" in publicKeyResult ? publicKeyResult.publicKey : undefined;
  const configurationError = publicKeyResult && "error" in publicKeyResult ? publicKeyResult.error : undefined;

  const { data: payment } = useQuery({
    queryKey: ["mercadopago-payment", rideId], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("mercadopago_payments")
        .select("id, status, status_detail, qr_code, qr_code_base64, expires_at")
        .eq("ride_id", rideId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as PaymentRow | null;
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`payment-${rideId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mercadopago_payments", filter: `ride_id=eq.${rideId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["mercadopago-payment", rideId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["ride-payment", rideId] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, rideId, qc]);

  useEffect(() => {
    if (!payment?.expires_at) return;
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(payment.expires_at ?? "").getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [payment?.expires_at]);

  // Reforço: se o aviso do Mercado Pago demorar, consultamos o status a cada 5s por até 2 min.
  useEffect(() => {
    if (!user || !payment || ride?.paid_at) return;
    if (!["pending", "in_process", "approved"].includes(payment.status)) return;
    let attempts = 0;
    let active = true;
    const tick = async () => {
      if (!active) return;
      attempts += 1;
      try {
        const result = await syncPayment({ data: { rideId } });
        if (!active) return;
        await qc.invalidateQueries({ queryKey: ["mercadopago-payment", rideId] });
        await qc.invalidateQueries({ queryKey: ["ride-payment", rideId] });
        if (result.paid) { active = false; window.clearInterval(timer); }
      } catch {
        // silencioso: nova tentativa no próximo intervalo
      }
      if (attempts >= 24) { active = false; window.clearInterval(timer); }
    };
    const timer = window.setInterval(() => { void tick(); }, 5000);
    void tick();
    return () => { active = false; window.clearInterval(timer); };
  }, [user, rideId, payment?.status, payment?.id, ride?.paid_at, qc, syncPayment, payment]);


  const countdown = useMemo(() => `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`, [secondsLeft]);
  const approved = Boolean(ride?.paid_at);
  const showPix = Boolean(payment?.qr_code && ["pending", "in_process"].includes(payment.status) && secondsLeft > 0);
  const canTryAgain = !payment || ["rejected", "cancelled", "expired"].includes(payment.status);

  const submitPayment = async (brickData: PaymentBrickData) => {
    if (!isValidCPF(cpf)) { toast.error("Digite um CPF válido para continuar."); throw new Error("CPF inválido"); }
    setSubmitted(true);
    setFormError(null);
    try {
      const result = await createPayment({ data: { rideId, cpf, brickData, couponId } });
      if ("error" in result) { setFormError(result.error); toast.error(result.error); throw new Error(result.error); }
      await qc.invalidateQueries({ queryKey: ["mercadopago-payment", rideId] });
      if (result.status === "approved") toast.success("Pagamento recebido. Aguarde a confirmação segura.");
      else if (result.qrCode) toast.success("Pix gerado. Pague em até 30 minutos.");
      else if (result.status === "rejected") { setFormError("Pagamento recusado. Tente outra forma de pagamento."); toast.error("Pagamento recusado. Tente outra forma de pagamento."); }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Não foi possível concluir o pagamento. Tente novamente.";
      setFormError(message);
      throw error;
    } finally {
      setSubmitted(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Pagamento da corrida</h1>
        <p className="mt-1 text-sm text-muted-foreground">Crédito, débito ou Pix, sem sair da GoPet.</p>
      </div>
      {returnRide && <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm">A volta é outra corrida e será paga separadamente por {formatBRL(returnRide.price_cents)}.</div>}
      {isLoading && <Skeleton className="h-40 w-full" />}
      {ride && <Card><CardContent className="space-y-3 py-5 text-sm">
        <p className="font-semibold">{ride.pet_name}</p>
        <p className="text-muted-foreground">{ride.origin_address} → {ride.destination_address}</p>
        <div className="flex justify-between border-t pt-3 text-lg font-semibold"><span>Total</span><span>{formatBRL(payAmount)}</span></div>{coupons.length > 0 && <div className="space-y-2 border-t pt-3"><Label htmlFor="cupom">Cupom de indicação</Label><select id="cupom" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={couponId ?? ""} onChange={(e) => setCouponId(e.target.value || null)}><option value="">Não usar cupom</option>{coupons.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.discount_percent}% de desconto</option>)}</select>{couponId && <p className="text-xs text-primary">Desconto de {formatBRL(ride.price_cents - payAmount)} aplicado.</p>}</div>}
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Processamento seguro pelo Mercado Pago. A GoPet não armazena dados do cartão.</p>
      </CardContent></Card>}

      {approved ? <Card className="border-success/40 bg-success/10"><CardContent className="flex flex-col items-center gap-3 py-10 text-center"><CheckCircle2 className="size-9 text-success"/><p className="font-semibold">Pagamento confirmado</p><p className="text-sm text-muted-foreground">Sua corrida foi liberada para os motoristas parceiros.</p><div className="flex flex-wrap justify-center gap-2">{returnRide && <Button asChild><Link to="/pagamento/$rideId" params={{ rideId: returnRide.id }}>Pagar corrida de volta</Link></Button>}<Button asChild variant="secondary"><Link to="/minhas-corridas/$rideId" params={{ rideId }}>Acompanhar corrida</Link></Button></div></CardContent></Card>
      : showPix ? <Card><CardHeader><CardTitle>Pix gerado</CardTitle><CardDescription>Escaneie ou copie o código. A corrida será liberada somente após a confirmação.</CardDescription></CardHeader><CardContent className="space-y-4 text-center">{payment?.qr_code_base64 && <img className="mx-auto size-60" src={`data:image/png;base64,${payment.qr_code_base64}`} alt="QR Code Pix"/>}<div className="flex items-center justify-center gap-2 font-semibold"><Clock3 className="size-4"/> Expira em {countdown}</div><div className="flex gap-2"><Input readOnly value={payment?.qr_code ?? ""} aria-label="Código Pix copia e cola"/><Button size="icon" variant="outline" title="Copiar código Pix" onClick={async () => { await navigator.clipboard.writeText(payment?.qr_code ?? ""); toast.success("Código Pix copiado."); }}><Copy className="size-4"/></Button></div></CardContent></Card>
      : <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="size-5 text-primary"/> Escolha como pagar</CardTitle><CardDescription>Informe um CPF válido. Ele é obrigatório para pagamentos via Pix.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="cpf-pagador">CPF do pagador</Label><Input id="cpf-pagador" inputMode="numeric" maxLength={14} value={cpf} onChange={(event) => setCpf(maskCPF(event.target.value))} placeholder="000.000.000-00"/><p className="text-xs text-muted-foreground">Obrigatório para Pix e validação do pagamento.</p></div>{payment && statusMessage[payment.status] && <p className={payment.status === "rejected" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{statusMessage[payment.status]}</p>}{configurationError && <p className="text-sm text-destructive">{configurationError}</p>}{publicKey && ride && isValidCPF(cpf) && canTryAgain && <Suspense fallback={<Skeleton className="h-80 w-full"/>}><MercadoPagoPaymentBrick publicKey={publicKey} amountCents={payAmount} {...(user?.email ? { email: user.email } : {})} cpf={cpf.replace(/\D/g, "")} onSubmit={submitPayment} onError={(message) => { setSubmitted(false); setFormError(message); toast.error(message); }}/></Suspense>}{formError && <p className="text-sm text-destructive">{formError}</p>}{submitted && <p className="flex items-center justify-center gap-2 text-sm"><Loader2 className="size-4 animate-spin"/> Processando pagamento…</p>}{!isValidCPF(cpf) && <p className="text-sm text-muted-foreground">Digite o CPF para liberar as formas de pagamento.</p>}</CardContent></Card>}
    </div>
  );
}
