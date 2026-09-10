export type RideStatus =
  | "pending"
  | "accepted"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled";

export const statusLabels: Record<RideStatus, string> = {
  pending: "Aguardando motorista",
  accepted: "Aceita",
  en_route: "A caminho do embarque",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const statusStyles: Record<RideStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  accepted: "bg-primary/15 text-primary-ink",
  en_route: "bg-primary/25 text-primary-ink",
  in_progress: "bg-accent/25 text-accent-foreground",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

/** Etapas visíveis na tela de acompanhamento, em ordem. */
export const trackingSteps: { status: RideStatus; label: string; hint: string }[] = [
  { status: "accepted", label: "Aceita", hint: "Motorista confirmou a corrida" },
  { status: "en_route", label: "A caminho", hint: "Indo buscar o pet" },
  { status: "in_progress", label: "Em andamento", hint: "Pet a bordo, rumo ao destino" },
  { status: "completed", label: "Concluída", hint: "Pet entregue com segurança" },
];

export const activeStatuses: RideStatus[] = ["accepted", "en_route", "in_progress"];

export function isActiveStatus(status: RideStatus) {
  return activeStatuses.includes(status);
}

export const serviceTypes = [
  { value: "veterinario", label: "Consulta veterinária" },
  { value: "banho_tosa", label: "Banho e tosa" },
  { value: "creche", label: "Creche / hotel" },
  { value: "aeroporto", label: "Aeroporto" },
  { value: "outro", label: "Outro destino" },
] as const;

export const petSizes = [
  { value: "pequeno", label: "Pequeno (até 5kg)", factor: 1.1 },
  { value: "medio", label: "Médio (até 10kg)", factor: 1.2 },
  { value: "grande", label: "Grande (acima de 10kg)", factor: 1.3 },
] as const;

export const petSpecies = [
  { value: "cachorro", label: "Cachorro" },
  { value: "gato", label: "Gato" },
  { value: "ave", label: "Ave" },
  { value: "roedor", label: "Roedor" },
  { value: "reptil", label: "Réptil" },
  { value: "outro", label: "Outro" },
] as const;

export const temperaments = [
  { value: "calmo", label: "Calmo" },
  { value: "agitado", label: "Agitado" },
  { value: "medroso", label: "Medroso / ansioso" },
  { value: "sociavel", label: "Sociável" },
  { value: "reativo", label: "Reativo com estranhos" },
] as const;

export const transportItems = [
  { value: "caixa", label: "Caixa de transporte" },
  { value: "cinto", label: "Cinto de segurança pet" },
  { value: "focinheira", label: "Focinheira" },
  { value: "tapete", label: "Tapete higiênico" },
  { value: "coleira_guia", label: "Coleira e guia" },
  { value: "agua", label: "Água / bebedouro" },
] as const;

export function labelOf(
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
) {
  if (!value) return null;
  return list.find((i) => i.value === value)?.label ?? value;
}

/** Estimativa simples: base + km, ajustada pelo porte do pet. */
export function estimatePriceCents(distanceKm: number, petSize: string): number {
  const factor = petSizes.find((s) => s.value === petSize)?.factor ?? 1;
  const base = 1200;
  const perKm = 290;
  return Math.round((base + distanceKm * perKm) * factor);
}

/** Estimativa grosseira de tempo, considerando trânsito de São Paulo (~22 km/h). */
export function estimateMinutes(distanceKm: number): number {
  return Math.max(5, Math.round((distanceKm / 22) * 60));
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

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

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

/** Central GoPet no WhatsApp. */
export const CENTRAL_WHATSAPP = "5511985125238";

/** Monta link wa.me com o resumo da corrida para encaminhar à central. */
export function rideWhatsAppUrl(ride: {
  pet_name: string;
  service_type: string;
  origin_address: string;
  destination_address: string;
  scheduled_at: string;
  distance_km: number;
  price_cents: number;
}): string {
  const service = serviceTypes.find((s) => s.value === ride.service_type)?.label ?? "Transporte";
  const text = [
    "🐾 Nova corrida GoPet",
    `Pet(s): ${ride.pet_name}`,
    `Motivo: ${service}`,
    `Embarque: ${ride.origin_address}`,
    `Destino: ${ride.destination_address}`,
    `Agendada para: ${formatDateTime(ride.scheduled_at)}`,
    `Distância: ${ride.distance_km} km`,
    `Valor: ${formatBRL(ride.price_cents)}`,
  ].join("\n");
  return `https://wa.me/${CENTRAL_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/** Coordenadas aproximadas de bairros de São Paulo, usadas como fallback no mapa. */
export const neighborhoodCoords: Record<string, [number, number]> = {
  Pinheiros: [-23.5647, -46.6989],
  "Vila Mariana": [-23.5893, -46.6345],
  Moema: [-23.6008, -46.6664],
  Tatuapé: [-23.5405, -46.5763],
  Santana: [-23.5023, -46.6249],
  Lapa: [-23.5225, -46.7042],
  Butantã: [-23.5714, -46.7192],
  Ipiranga: [-23.5916, -46.6019],
  Perdizes: [-23.5379, -46.6795],
  Morumbi: [-23.6019, -46.7218],
  "Santo Amaro": [-23.6543, -46.7079],
  "Bela Vista": [-23.5613, -46.6455],
};

export const spCenter: [number, number] = [-23.5613, -46.6565];

export function coordsFor(
  neighborhood: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): [number, number] {
  if (typeof lat === "number" && typeof lng === "number") return [lat, lng];
  if (neighborhood && neighborhoodCoords[neighborhood]) return neighborhoodCoords[neighborhood]!;
  return spCenter;
}

/** Distância em km entre dois pontos (Haversine). */
export function distanceKmBetween(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
