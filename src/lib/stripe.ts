import { loadStripe, type Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

function paymentsEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error(
    "Os pagamentos ainda não estão configurados para esta versão do app. Conclua a ativação do Stripe no seu projeto Lovable.",
  );
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment();
    stripePromise = loadStripe(clientToken as string);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}

/** Comissão da plataforma sobre o valor da corrida. */
export const PLATFORM_FEE_RATE = 0.2;

/** Taxa retida quando o tutor cancela após o motorista aceitar. */
export const CANCELLATION_FEE_RATE = 0.2;

export function splitRideAmount(amountCents: number) {
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  return { platformFeeCents, driverAmountCents: amountCents - platformFeeCents };
}

export const paymentStatusLabels: Record<string, string> = {
  pending: "Pagamento pendente",
  held: "Pago (retido até a conclusão)",
  released: "Repassado ao motorista",
  refunded: "Estornado",
  cancelled: "Pagamento cancelado",
  failed: "Falha no pagamento",
};

export const paymentStatusStyles: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  held: "bg-primary/15 text-primary-ink",
  released: "bg-success/20 text-success",
  refunded: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};
