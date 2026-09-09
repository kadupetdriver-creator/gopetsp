import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, QrCode, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { CreditTopupCheckout } from "@/components/CreditTopupCheckout";
import { formatBRL } from "@/lib/rides";
import { getStripeEnvironment } from "@/lib/stripe";
import { syncCreditTopup, MIN_TOPUP_CENTS, MAX_TOPUP_CENTS } from "@/lib/credits.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creditos")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string | undefined } => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Créditos GoPet | Recarregue com cartão ou Pix" },
      {
        name: "description",
        content:
          "Adicione créditos na sua conta GoPet com cartão ou Pix e use o saldo nas corridas de transporte de pets em São Paulo.",
      },
      { property: "og:title", content: "Créditos GoPet | Recarregue com cartão ou Pix" },
      {
        property: "og:description",
        content: "Recarregue seu saldo GoPet com cartão ou Pix e acompanhe o extrato de créditos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreditosPage,
});

const PRESETS = [5000, 10000, 20000, 50000];

const statusLabels: Record<string, string> = {
  pending: "Aguardando pagamento",
  completed: "Confirmado",
  failed: "Falhou",
  cancelled: "Cancelado",
};

function CreditosPage() {
  const { user } = useRoleGuard("tutor", "/creditos");
  const { session_id: sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [amountInput, setAmountInput] = useState("50,00");
  const [method, setMethod] = useState<"card" | "pix">("card");
  const [checkoutKey, setCheckoutKey] = useState<{ amountCents: number; method: "card" | "pix" } | null>(
    null,
  );

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["credit-transactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id, kind, amount_cents, status, payment_method, description, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const balance = (transactions ?? [])
    .filter((t) => t.status === "completed")
    .reduce((acc, t) => acc + (t.kind === "spend" ? -t.amount_cents : t.amount_cents), 0);

  useEffect(() => {
    if (!sessionId || !user) return;
    let active = true;
    void (async () => {
      const result = await syncCreditTopup({
        data: { sessionId, environment: getStripeEnvironment() },
      });
      if (!active) return;
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.status === "completed") {
        toast.success("Créditos adicionados à sua conta!");
      } else {
        toast.info("Pagamento em processamento. O saldo entra assim que for confirmado.");
      }
      setCheckoutKey(null);
      void queryClient.invalidateQueries({ queryKey: ["credit-transactions", user.id] });
    })();
    return () => {
      active = false;
    };
  }, [sessionId, user, queryClient]);

  const parsedCents = Math.round(
    Number(amountInput.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "")) * 100,
  );
  const validAmount =
    Number.isFinite(parsedCents) && parsedCents >= MIN_TOPUP_CENTS && parsedCents <= MAX_TOPUP_CENTS;

  const returnUrl = `${typeof window === "undefined" ? "" : window.location.origin}/creditos?session_id={CHECKOUT_SESSION_ID}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <PaymentTestModeBanner />

      <div>
        <h1 className="text-3xl font-semibold">Meus créditos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adicione saldo com cartão ou Pix e use nas corridas do seu pet.
        </p>
      </div>

      <Card className="shadow-soft">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Wallet className="size-4 text-primary-ink" /> Saldo disponível
          </CardDescription>
          <CardTitle className="text-3xl">{formatBRL(balance)}</CardTitle>
        </CardHeader>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-lg">Inserir créditos</CardTitle>
          <CardDescription>
            Valor mínimo de {formatBRL(MIN_TOPUP_CENTS)} por recarga.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={parsedCents === preset ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setAmountInput((preset / 100).toFixed(2).replace(".", ","))}
              >
                {formatBRL(preset)}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Outro valor (R$)</Label>
            <Input
              id="valor"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0,00"
            />
            {!validAmount && (
              <p className="text-xs text-destructive">
                Informe um valor entre {formatBRL(MIN_TOPUP_CENTS)} e {formatBRL(MAX_TOPUP_CENTS)}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { id: "card", label: "Cartão", icon: CreditCard, hint: "Crédito, confirmação na hora" },
                  { id: "pix", label: "Pix", icon: QrCode, hint: "QR Code, confirmação em segundos" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMethod(option.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    method === option.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  <option.icon className="mt-0.5 size-5 text-primary-ink" />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full rounded-full"
            disabled={!validAmount}
            onClick={() => setCheckoutKey({ amountCents: parsedCents, method })}
          >
            Continuar para o pagamento
          </Button>
        </CardContent>
      </Card>

      {checkoutKey && (
        <CreditTopupCheckout
          amountCents={checkoutKey.amountCents}
          method={checkoutKey.method}
          returnUrl={returnUrl}
        />
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Extrato</h2>
        {isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
        {!isLoading && (transactions?.length ?? 0) === 0 && (
          <Card className="shadow-soft">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma movimentação de créditos ainda.
            </CardContent>
          </Card>
        )}
        {transactions?.map((tx) => (
          <Card key={tx.id} className="shadow-soft">
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-medium">
                  {tx.description ?? (tx.kind === "spend" ? "Uso em corrida" : "Recarga")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(tx.created_at).toLocaleString("pt-BR")} ·{" "}
                  {statusLabels[tx.status] ?? tx.status}
                </p>
              </div>
              <span
                className={cn(
                  "text-sm font-semibold",
                  tx.kind === "spend" ? "text-destructive" : "text-success",
                )}
              >
                {tx.kind === "spend" ? "-" : "+"}
                {formatBRL(tx.amount_cents)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
