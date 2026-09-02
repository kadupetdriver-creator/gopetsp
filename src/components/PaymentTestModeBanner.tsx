const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        O pagamento em produção ainda não está configurado neste app.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm text-warning-foreground">
        Ambiente de teste: use o cartão 4242 4242 4242 4242 para simular o pagamento.
      </div>
    );
  }
  return null;
}
