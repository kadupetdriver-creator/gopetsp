import { DRIVER_SHARE_RATE } from "./pricing";

/**
 * Política de cancelamento pelo tutor.
 * Enquanto CANCELLATION_FEES_ACTIVE for false, as taxas são apenas calculadas e
 * registradas como "previstas"; o reembolso real continua integral.
 */
export const CANCELLATION_FEES_ACTIVE = false;

export const FREE_WINDOW_HOURS = 120;
export const SHORT_NOTICE_RATE = 30;
export const DRIVER_MOVING_RATE = 50;

export type CancellationTier = "unpaid" | "free" | "short_notice" | "driver_en_route" | "driver_arrived" | "exception";
export type DriverState = "none" | "accepted" | "en_route" | "arrived" | "in_progress";

export const tierLabels: Record<CancellationTier, string> = {
  unpaid: "Corrida ainda não paga — sem taxa",
  free: "Mais de 5 dias de antecedência — gratuito",
  short_notice: "Menos de 5 dias de antecedência — taxa de 30%",
  driver_en_route: "Motorista já a caminho — taxa de 50%",
  driver_arrived: "Motorista já no local — taxa de 50%",
  exception: "Exceção autorizada pela GoPet — sem taxa",
};

export const driverStateLabels: Record<DriverState, string> = {
  none: "Sem motorista",
  accepted: "Aceita (não saiu)",
  en_route: "A caminho",
  arrived: "Chegou ao local",
  in_progress: "Em andamento",
};

export type CancellationRideInput = {
  status: string;
  scheduled_at: string;
  price_cents: number;
  paid_at: string | null;
  driver_id: string | null;
  arrived_at: string | null;
  driver_fixed_cents?: number | null;
};

export function driverStateOf(ride: CancellationRideInput): DriverState {
  if (ride.status === "in_progress") return "in_progress";
  if (ride.status === "en_route") return ride.arrived_at ? "arrived" : "en_route";
  if (ride.driver_id && ride.status === "accepted") return "accepted";
  return "none";
}

export function canTutorCancel(status: string) {
  return status === "pending" || status === "accepted" || status === "en_route";
}

export type CancellationQuote = {
  tier: CancellationTier;
  ratePercent: number;
  feeCents: number;
  refundCents: number;
  driverShareCents: number;
  driverState: DriverState;
  hoursBefore: number;
};

/** Parcela do motorista sobre a taxa efetivamente retida (75%, ou proporcional ao valor fixo). */
export function driverShareOfFee(feeCents: number, priceCents: number, fixedCents?: number | null) {
  if (feeCents <= 0) return 0;
  if (typeof fixedCents === "number" && fixedCents > 0 && priceCents > 0) {
    return Math.round((feeCents * fixedCents) / priceCents);
  }
  return Math.round(feeCents * DRIVER_SHARE_RATE);
}

export function cancellationQuote(ride: CancellationRideInput, now: Date = new Date(), exception = false): CancellationQuote {
  const driverState = driverStateOf(ride);
  const hoursBefore = (new Date(ride.scheduled_at).getTime() - now.getTime()) / 3_600_000;
  const price = Math.max(0, Math.round(ride.price_cents));
  let tier: CancellationTier;
  let rate: number;
  if (!ride.paid_at) { tier = "unpaid"; rate = 0; }
  else if (exception) { tier = "exception"; rate = 0; }
  else if (driverState === "arrived" || driverState === "in_progress") { tier = "driver_arrived"; rate = DRIVER_MOVING_RATE; }
  else if (driverState === "en_route") { tier = "driver_en_route"; rate = DRIVER_MOVING_RATE; }
  else if (hoursBefore > FREE_WINDOW_HOURS) { tier = "free"; rate = 0; }
  else { tier = "short_notice"; rate = SHORT_NOTICE_RATE; }
  const feeCents = Math.round((price * rate) / 100);
  return {
    tier, ratePercent: rate, feeCents,
    refundCents: ride.paid_at ? price - feeCents : 0,
    driverShareCents: driverShareOfFee(feeCents, price, ride.driver_fixed_cents),
    driverState, hoursBefore,
  };
}
