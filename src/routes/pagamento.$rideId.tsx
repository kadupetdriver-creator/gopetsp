import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, MessageCircle, QrCode, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RideCheckout } from "@/components/RideCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { formatBRL, rideWhatsAppUrl } from "@/lib/rides";
import { getStripeEnvironment, splitRideAmount } from "@/lib/stripe";
import { syncRidePayment } from "@/lib/payments.functions";

export const Route = createFileRoute("/pagamento/$rideId")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string | undefined } => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pagamento da corrida | GoPet" },
      {
        name: "description",
        content:
          "Pague a corrida do seu pet com segurança. O valor fica retido e só é repassado ao motorista após a conclusão do transporte.",
      },
      { property: "og:title", content: "Pagamento da corrida | GoPet" },
      {
        property: "og:description",
        content: "Cobrança segura com retenção até a conclusão da corrida.",
      },
    ],
  }),
  component: PagamentoCorrida,
});

function PagamentoCorrida() {
  const { rideId } = Route.useParams();
  const { session_id: sessionId } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [method, setMethod] = useState<"card" | "pix">("pix");

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: ride, isLoading } = useQuery({
    queryKey: ["ride-payment", rideId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select(
          "id, pet_name, service_type, origin_address, destination_address, scheduled_at, price_cents, distance_km, status",
        )
        .eq("id", rideId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!sessionId || !user) return;
    let active = true;
    void (async () => {
      const result = await syncRidePayment({
        data: { sessionId, environment: getStripeEnvironment() },
      });
      if (!active) return;
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.status === "held" || result.status === "released") {
        setConfirmed(true);
        toast.success("Pagamento confirmado! O valor fica retido até a conclusão da corrida.");
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId, user]);

  const amount = ride?.price_cents ?? 0;
  const { platformFeeCents, driverAmountCents } = splitRideAmount(amount);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <PaymentTestModeBanner />
      <h1 className="text-3xl font-semibold">Pagamento da corrida</h1>
      <p className="text-sm text-muted-foreground">
        A cobrança é feita agora e o valor fica retido com segurança. O repasse ao motorista só
        acontece depois que a corrida é concluída.
      </p>

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}

      {ride && (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-lg">{ride.pet_name}</CardTitle>
            <CardDescription>{ride.distance_km} km em São Paulo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor do motorista</span>
              <span>{formatBRL(driverAmountCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxa da plataforma (20%)</span>
              <span>{formatBRL(platformFeeCents)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatBRL(amount)}</span>
            </div>
            <p className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-primary-ink" /> Valor retido até a conclusão do
              transporte.
            </p>
          </CardContent>
        </Card>
      )}

      {confirmed ? (
        <Card className="border-success/40 bg-success/10">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <p className="font-medium">Pagamento confirmado</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Já estamos procurando um motorista parceiro. Você acompanha tudo em tempo real.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button asChild className="rounded-full">
                <Link to="/minhas-corridas">Ver minhas corridas</Link>
              </Button>
              {ride && (
                <Button asChild variant="secondary" className="rounded-full">
                  <a href={rideWhatsAppUrl(ride)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 size-4" />
                    Enviar para a central (WhatsApp)
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        ride && (
          <>
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="text-lg">Como você quer pagar?</CardTitle>
                <CardDescription>Escolha entre Pix ou cartão de crédito.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {(
                  [
                    { id: "pix", label: "Pix", icon: QrCode, hint: "QR Code, aprovação rápida" },
                    { id: "card", label: "Cartão", icon: CreditCard, hint: "Crédito à vista" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMethod(option.id)}
                    className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-4 py-4 text-sm font-medium transition ${
                      method === option.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <option.icon className="size-5" />
                    {option.label}
                    <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
            <RideCheckout
              key={method}
              rideId={rideId}
              returnUrl={returnUrlFor(rideId)}
              method={method}
            />
          </>
        )
      )}
    </div>
  );
}

function returnUrlFor(rideId: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/pagamento/${rideId}?session_id={CHECKOUT_SESSION_ID}`;
}
