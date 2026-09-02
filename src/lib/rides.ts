export type RideStatus = "pending" | "accepted" | "in_progress" | "completed" | "cancelled";

export const statusLabels: Record<RideStatus, string> = {
  pending: "Aguardando motorista",
  accepted: "Motorista a caminho",
  in_progress: "Em transporte",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const statusStyles: Record<RideStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  accepted: "bg-primary/15 text-primary",
  in_progress: "bg-accent/25 text-accent-foreground",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

export const serviceTypes = [
  { value: "veterinario", label: "Consulta veterinária" },
  { value: "banho_tosa", label: "Banho e tosa" },
  { value: "creche", label: "Creche / hotel" },
  { value: "aeroporto", label: "Aeroporto" },
  { value: "outro", label: "Outro destino" },
] as const;

export const petSizes = [
  { value: "pequeno", label: "Pequeno (até 10kg)", factor: 1 },
  { value: "medio", label: "Médio (10–25kg)", factor: 1.2 },
  { value: "grande", label: "Grande (acima de 25kg)", factor: 1.45 },
] as const;

export const spSubprefeituras = [
  "Pinheiros",
  "Vila Mariana",
  "Moema",
  "Tatuapé",
  "Santana",
  "Lapa",
  "Butantã",
  "Ipiranga",
  "Perdizes",
  "Morumbi",
  "Santo Amaro",
  "Bela Vista",
];

/** Estimativa simples: base + km, ajustada pelo porte do pet. */
export function estimatePriceCents(distanceKm: number, petSize: string): number {
  const factor = petSizes.find((s) => s.value === petSize)?.factor ?? 1;
  const base = 1800;
  const perKm = 320;
  return Math.round((base + distanceKm * perKm) * factor);
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
