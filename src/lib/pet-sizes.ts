/** Classificação e tarifas por porte compartilhadas por cadastro e orçamentos. */
export const petSizes = [
  { value: "mini", label: "Mini / toy (até 5 kg)", maxWeightKg: 5, factor: 1.1 },
  { value: "pequeno", label: "Pequeno (5,1 a 10 kg)", maxWeightKg: 10, factor: 1.1 },
  { value: "medio", label: "Médio (10,1 a 25 kg)", maxWeightKg: 25, factor: 1.2 },
  { value: "grande", label: "Grande (25,1 a 40 kg)", maxWeightKg: 40, factor: 1.3 },
  { value: "gigante", label: "Gigante (acima de 40 kg)", maxWeightKg: Infinity, factor: 1.3 },
] as const;

export const SIZE_RANK: string[] = petSizes.map((size) => size.value);