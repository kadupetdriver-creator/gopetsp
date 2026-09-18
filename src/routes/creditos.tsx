import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, QrCode, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, CENTRAL_WHATSAPP } from "@/lib/rides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creditos")({
  head: () => ({
    meta: [
      { title: "Créditos GoPet | Saldo para as corridas" },
      {
        name: "description",
        content:
          "Consulte seu saldo GoPet e o histórico de créditos da sua conta.",
      },
      { property: "og:title", content: "Créditos GoPet | Saldo para as corridas" },
      {
        property: "og:description",
        content: "Veja seu saldo GoPet e o extrato de créditos usados nas corridas do seu pet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreditosPage,
});

const statusLabels: Record<string, string> = {
  pending: "Aguardando pagamento",
  completed: "Confirmado",
  failed: "Falhou",
  cancelled: "Cancelado",
};

const whatsappUrl = `https://wa.me/${CENTRAL_WHATSAPP}?text=${encodeURIComponent(
  "Olá! Quero inserir saldo na minha conta GoPet. Pode me enviar o link de pagamento ou o QR Code do Pix?",
)}`;

function CreditosPage() {
  const { user } = useRoleGuard("tutor", "/creditos");

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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Meus créditos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulte créditos anteriores da sua conta. Novas corridas são pagas diretamente no checkout.
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

      <Card className="shadow-soft border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg">Atendimento da central</CardTitle>
          <CardDescription>
            Para dúvidas sobre créditos anteriores, chame a nossa central pelo WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <MessageCircle className="mt-0.5 size-4 text-primary-ink" />
              <span>
                <strong>Cartão de crédito:</strong> a central envia um link de pagamento seguro.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <QrCode className="mt-0.5 size-4 text-primary-ink" />
              <span>
                <strong>Pix:</strong> a central envia o QR Code para pagamento imediato.
              </span>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            O pagamento de novas corridas é feito diretamente na tela de pagamento.
          </p>
          <Button asChild className="w-full rounded-full">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 size-4" />
              Chamar a central no WhatsApp
            </a>
          </Button>
        </CardContent>
      </Card>

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
