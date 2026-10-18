export const MIN_TOPUP_CENTS = 1000;
export const MAX_TOPUP_CENTS = 200000;

/** Converte o texto digitado pelo tutor ("50", "50,90") em centavos válidos para recarga, ou null. */
export function parseTopupCents(input: string): number | null {
  const normalized = input.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents >= MIN_TOPUP_CENTS && cents <= MAX_TOPUP_CENTS ? cents : null;
}
