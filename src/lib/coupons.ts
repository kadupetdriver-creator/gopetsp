/** Valor a pagar com cupom: aplica o percentual e depois o desconto fixo; nunca abaixo de R$ 0,01. Igual a public.coupon_amount_cents. */
export function couponAmountCents(
  priceCents: number,
  coupon: { discount_percent: number; discount_cents?: number | null },
): number {
  return Math.max(
    1,
    Math.round((priceCents * (100 - (coupon.discount_percent ?? 0))) / 100) - (coupon.discount_cents ?? 0),
  );
}

/** Rótulo do desconto do cupom. */
export function couponLabel(coupon: { discount_percent: number; discount_cents?: number | null }): string {
  if (coupon.discount_cents) return `R$ ${(coupon.discount_cents / 100).toFixed(2).replace(".", ",")} de desconto`;
  return `${coupon.discount_percent}% de desconto`;
}
