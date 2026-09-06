import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { formatBRL } from "@/lib/rides";
import { paymentStatusLabels, paymentStatusStyles } from "@/lib/stripe";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos e repasses | GoPet" },
      {
        name: "description",
        content:
          "Acompanhe o histórico financeiro das corridas GoPet: valores pagos, taxa da plataforma, repasses ao motorista e estornos.",
      },
      { property: "og:title", content: "Pagamentos e repasses | GoPet" },
      {
        property: "og:description",
        content: "Extrato de pagamentos, taxas e repasses das corridas GoPet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PagamentosPage,
});

function PagamentosPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const isDriver = profile?.role === "driver";

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_payments")
        .select(
          "id, ride_id, amount_cents, platform_fee_cents, driver_amount_cents, refunded_cents, cancellation_fee_cents, status, created_at, paid_at, released_at, rides(pet_name, destination_address)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totals = (payments ?? []).reduce(
    (acc, p) => {
      if (p.status === "released") {
        acc.released += isDriver ? p.driver_amount_cents : p.amount_cents;
      }
      if (p.status === "held") acc.held += isDriver ? p.driver_amount_cents : p.amount_cents;
      return acc;
    },
    { released: 0, held: 0 },
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <PaymentTestModeBanner />
      <div>
        <h1 className="text-3xl font-semibold">
          {isDriver ? "Meus repasses" : "Meus pagamentos"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDriver
            ? "Valores retidos e já repassados pelas corridas concluídas."
            : "Histórico de cobranças, taxas e estornos das suas corridas."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="shadow-soft">
          <CardHeader className="pb-2">
            <CardDescription>{isDriver ? "Aguardando conclusão" : "Retido"}</CardDescription>
            <CardTitle className="text-2xl">{formatBRL(totals.held)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="shadow-soft">
          <CardHeader className="pb-2">
            <CardDescription>{isDriver ? "Já repassado" : "Concluído"}</CardDescription>
            <CardTitle className="text-2xl">{formatBRL(totals.released)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}

      {!isLoading && (payments?.length ?? 0) === 0 && (
        <Card className="shadow-soft">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="size-8 text-primary-ink" />
            <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/minhas-corridas">Ver minhas corridas</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {payments?.map((payment) => (
          <Card key={payment.id} className="shadow-soft">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {payment.rides?.pet_name ?? "Corrida GoPet"}
                </CardTitle>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    paymentStatusStyles[payment.status],
                  )}
                >
                  {paymentStatusLabels[payment.status]}
                </span>
              </div>
              <CardDescription>
                {new Date(payment.created_at).toLocaleString("pt-BR")}
                {payment.rides?.destination_address
                  ? ` · ${payment.rides.destination_address}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">{formatBRL(payment.amount_cents)}</span>
              </div>
              {payment.refunded_cents > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estornado</span>
                  <span>{formatBRL(payment.refunded_cents)}</span>
                </div>
              )}
              {payment.cancellation_fee_cents > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxa de cancelamento</span>
                  <span>{formatBRL(payment.cancellation_fee_cents)}</span>
                </div>
              )}
              <div className="pt-1">
                <Button asChild variant="link" className="h-auto p-0 text-sm">
                  <Link to="/minhas-corridas">Ver corrida</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
