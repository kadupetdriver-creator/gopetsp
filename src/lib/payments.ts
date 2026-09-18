/** Situação consolidada do pagamento da corrida. */
export type RidePaymentState = "pending" | "paid" | "refunded";

/** Taxa retida quando o tutor cancela após o motorista aceitar. */
export const CANCELLATION_FEE_RATE = 0.2;

export const paymentStatusLabels: Record<RidePaymentState, string> = {
  pending: "Pagamento pendente",
  paid: "Pago",
  refunded: "Estornado",
};

export const paymentStatusStyles: Record<RidePaymentState, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  paid: "bg-success/20 text-success",
  refunded: "bg-muted text-muted-foreground",
};

export function ridePaymentState(ride: {
  paid_at?: string | null;
  status?: string | null;
}): RidePaymentState {
  if (!ride.paid_at) return "pending";
  return ride.status === "cancelled" ? "refunded" : "paid";
}
