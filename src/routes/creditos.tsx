import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getCreditBalance } from "@/lib/credits.functions";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Wallet } from "lucide-react";
import { TopupPanel } from "@/components/TopupPanel";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/hooks/useRoleGuard";
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
        .eq("user_id", user?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const fetchBalance = useServerFn(getCreditBalance);
  const { data: creditBalance } = useQuery({
    queryKey: ["credit-balance", user?.id], enabled: !!user,
    queryFn: () => fetchBalance(),
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Meus créditos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saldo GoPet e movimentações da sua conta.
        </p>
      </div>

      <Card className="shadow-soft">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2">
            <Wallet className="size-4 text-primary-ink" /> Saldo disponível
          </CardDescription>
          <CardTitle className="text-3xl">{creditBalance ? formatBRL(creditBalance.balanceCents) : "—"}</CardTitle>
        </CardHeader>
      </Card>

      {user && <TopupPanel userId={user.id} email={user.email} />}

      <p className="text-center text-xs text-muted-foreground">
        Dúvidas?{" "}
        <a className="underline" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="inline size-3" /> Fale com a central
        </a>
      </p>

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
