/** Checkout eligibility; the database revalidates balance and payment attempts atomically. */
export function canPayWithGoPetBalance(balanceCents: number | undefined, amountCents: number, hasPendingPayment: boolean): boolean {
  return balanceCents !== undefined && Number.isInteger(amountCents) && amountCents > 0 && balanceCents >= amountCents && !hasPendingPayment;
}