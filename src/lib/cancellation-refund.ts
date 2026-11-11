/** Regras puras do estorno de cancelamento (sem acesso a rede). */
export const MP_REFUND_WINDOW_DAYS = 180;
const PARTIAL_TYPES = ["credit_card", "debit_card", "bank_transfer", "account_money", "pix"];

export type PartialRefundCheck = { allowed: boolean; reason: string | null };

export function partialRefundSupport(input: {
  orderStatus: string; paymentType: string | null; paidAt: string | null; alreadyRefunded: boolean; now?: Date;
}): PartialRefundCheck {
  const now = input.now ?? new Date();
  if (input.alreadyRefunded) return { allowed: false, reason: "O pagamento já foi estornado." };
  if (!["processed", "approved"].includes(input.orderStatus.toLowerCase()))
    return { allowed: false, reason: "O pagamento ainda não foi confirmado (pendente ou em análise)." };
  if (input.paidAt && now.getTime() - new Date(input.paidAt).getTime() > MP_REFUND_WINDOW_DAYS * 86_400_000)
    return { allowed: false, reason: "Prazo de 180 dias para estorno expirado." };
  const t = (input.paymentType ?? "").toLowerCase();
  if (!PARTIAL_TYPES.includes(t)) return { allowed: false, reason: `Forma de pagamento sem estorno parcial (${t || "desconhecida"}).` };
  return { allowed: true, reason: null };
}

/** Valor a devolver: integral sem registro/sem cobrança ativa; senão o valor previsto da política. */
/** Proporcional ao valor efetivamente pago (cupons reduzem o valor pago). */
export function refundAmountCents(paidCents: number, cancellation: { refund_cents: number; ride_price_cents?: number } | null, feesActive: boolean) {
  if (!feesActive || !cancellation) return paidCents;
  const price = cancellation.ride_price_cents ?? paidCents;
  const value = price > 0 ? Math.round((paidCents * cancellation.refund_cents) / price) : paidCents;
  return Math.max(0, Math.min(paidCents, value));
}

export const centsToMpAmount = (cents: number) => (cents / 100).toFixed(2);
