import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, rideWhatsAppUrl } from "@/lib/rides";
import { getCreditBalance, payRideWithCredits } from "@/lib/credits.functions";

export const Route = createFileRoute("/pagamento/$rideId")({
  head: () => ({
    meta: [
      { title: "Pagamento da corrida | GoPet" },
      {
        name: "description",
        content:
          "Pague a corrida do seu pet com o saldo GoPet, de forma simples e segura, antes do início do transporte.",
      },
      { property: "og:title", content: "Pagamento da corrida | GoPet" },
      {
        property: "og:description",
        content: "Pagamento da corrida do seu pet com saldo GoPet.",
      },
    ],
  }),
  component: PagamentoCorrida,
});

function PagamentoCorrida() {
  const { rideId } = Route.useParams();
  const { user, loading } = useRoleGuard("tutor");
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  
  const [payingWithCredits, setPayingWithCredits] = useState(false);

  const { data: ride, isLoading } = useQuery({
    queryKey: ["ride-payment", rideId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select(
          "id, pet_name, service_type, origin_address, destination_address, scheduled_at, price_cents, distance_km, status, return_of_ride_id",
        )
        .eq("id", rideId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Quando o motorista não aguarda no local, a viagem vira duas corridas:
  // esta (ida) e a de volta, que também precisa ser paga.
  const { data: returnRide } = useQuery({
    queryKey: ["ride-return-pair", rideId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("id, price_cents, scheduled_at")
        .eq("return_of_ride_id", rideId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: balanceCents = 0, refetch: refetchBalance } = useQuery({
    queryKey: ["credit-balance"],
    enabled: !!user,
    queryFn: async () => (await getCreditBalance({ data: undefined })).balanceCents,
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <PaymentTestModeBanner />
      <h1 className="text-3xl font-semibold">Pagamento da corrida</h1>
      <div className="flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
        <Wallet className="mt-0.5 size-5 shrink-0 text-primary-ink" />
        <span>
          <strong>Aceitamos somente saldo GoPet.</strong> Não aceitamos dinheiro, cartão na hora
          nem Pix direto ao motorista — insira saldo com a nossa central e pague por aqui, com
          segurança.
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        A cobrança é feita agora e o valor fica retido com segurança. O repasse ao motorista só
        acontece depois que a corrida é concluída.
      </p>

      {returnRide && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          Esta viagem foi dividida em <strong>duas corridas</strong>: a ida (esta) e a volta
          ({formatBRL(returnRide.price_cents)}). Cada uma pode ser aceita por um motorista
          diferente e é paga separadamente.
        </div>
      )}
      {ride?.return_of_ride_id && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          Esta é a <strong>corrida de volta</strong>, separada da ida e com motorista próprio.
        </div>
      )}

      {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}

      {ride && (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-lg">{ride.pet_name}</CardTitle>
            <CardDescription>{ride.distance_km} km em São Paulo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatBRL(amount)}</span>
            </div>
            <p className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-primary-ink" /> Valor retido até a conclusão do
              transporte.
            </p>
            <div className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wide text-primary-ink">
              Não aceitamos dinheiro em espécie. O pagamento é feito somente com o saldo GoPet
              antes do início do transporte.
            </div>
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
              {returnRide && (
                <Button asChild className="rounded-full">
                  <Link to="/pagamento/$rideId" params={{ rideId: returnRide.id }}>
                    Pagar corrida de volta ({formatBRL(returnRide.price_cents)})
                  </Link>
                </Button>
              )}
              <Button asChild variant={returnRide ? "secondary" : "default"} className="rounded-full">
                <Link to="/minhas-corridas/$rideId" params={{ rideId }}>
                  Acompanhar minha corrida
                </Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-full">
                <Link to="/minhas-corridas">Ver todas as corridas</Link>
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
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="size-5 text-primary-ink" /> Pagamento com saldo GoPet
              </CardTitle>
              <CardDescription>
                As corridas são pagas exclusivamente com o saldo da sua conta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo disponível</span>
                <span className="font-medium">{formatBRL(balanceCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor da corrida</span>
                <span className="font-medium">{formatBRL(amount)}</span>
              </div>
              {balanceCents < amount ? (
                <div className="space-y-3 pt-1">
                  <p className="text-sm text-destructive">
                    Saldo insuficiente. Faltam {formatBRL(amount - balanceCents)}.
                  </p>
                  <Button asChild variant="secondary" className="w-full rounded-full">
                    <Link to="/creditos">Inserir saldo</Link>
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full rounded-full"
                  disabled={payingWithCredits}
                  onClick={async () => {
                    setPayingWithCredits(true);
                    const result = await payRideWithCredits({ data: { rideId } });
                    setPayingWithCredits(false);
                    if ("error" in result) {
                      toast.error(result.error);
                      return;
                    }
                    void refetchBalance();
                    toast.success("Corrida paga com seu saldo GoPet.");
                    void navigate({
                      to: "/minhas-corridas/$rideId",
                      params: { rideId },
                    });
                  }}
                >
                  Pagar {formatBRL(amount)} com saldo
                </Button>
              )}
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
