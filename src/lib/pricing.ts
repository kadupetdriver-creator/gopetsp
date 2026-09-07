/**
 * Regras comerciais de preço do GoPet.
 * Este módulo é a única fonte de verdade do cálculo e é executado no backend.
 */

export const PRICE_BASE_CENTS = 1200;
export const PRICE_PER_KM_CENTS = 290;
export const TRUNK_FEE_CENTS = 500;
/** Pets adicionais pagam 40% do valor integral do próprio porte. */
export const EXTRA_PET_FACTOR = 0.4;

export const SIZE_FACTORS: Record<string, number> = {
  pequeno: 1.1,
  medio: 1.2,
  grande: 1.3,
};

export const SIZE_RANK = ["pequeno", "medio", "grande"];

export function sizeFactor(size: string): number {
  return SIZE_FACTORS[size] ?? 1;
}

/** Valor integral de um pet, dado o porte e a distância por vias. */
export function fullPetPriceCents(distanceKm: number, size: string): number {
  return Math.round((PRICE_BASE_CENTS + distanceKm * PRICE_PER_KM_CENTS) * sizeFactor(size));
}

export type PriceBreakdown = {
  priceCents: number;
  trunkFeeCents: number;
  groupSize: string;
  petCount: number;
};

/**
 * Preço final: pets ordenados do maior para o menor porte; o primeiro paga o
 * valor integral e cada pet seguinte paga 40% do valor integral do seu porte.
 * Porta-malas soma uma taxa fixa.
 */
export function calculateRidePrice(
  distanceKm: number,
  petSizes: string[],
  needsTrunk: boolean,
): PriceBreakdown {
  const ordered = [...petSizes].sort((a, b) => SIZE_RANK.indexOf(b) - SIZE_RANK.indexOf(a));
  const subtotal = ordered.reduce(
    (sum, size, i) => sum + fullPetPriceCents(distanceKm, size) * (i === 0 ? 1 : EXTRA_PET_FACTOR),
    0,
  );
  const trunkFeeCents = needsTrunk ? TRUNK_FEE_CENTS : 0;
  const groupSize = ordered[0] ?? "medio";
  return {
    priceCents: Math.round(subtotal) + trunkFeeCents,
    trunkFeeCents,
    groupSize,
    petCount: ordered.length,
  };
}
