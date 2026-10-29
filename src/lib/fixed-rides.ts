import { z } from "zod";
import { addressHasNumber } from "./address";
import { parseRescheduleInput } from "./ride-reschedule";

const point = z.object({
  address: z.string().trim().min(1).max(300),
  neighborhood: z.string().nullable(),
  lat: z.number().min(-24.1).max(-23.1),
  lng: z.number().min(-47.1).max(-46.05),
}).refine((p) => addressHasNumber(p.address), "Informe o número ou S/N em cada endereço.");

export function fixedPriceCents(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um preço válido com até duas casas decimais.");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 2147483647) throw new Error("Informe um preço maior que zero e dentro do valor permitido.");
  return cents;
}

export const fixedRideSchema = z.object({
  requestId: z.string().uuid(),
  tutorId: z.string().uuid(),
  petIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um pet.").max(3, "Máximo de 3 pets por corrida.").refine((ids) => new Set(ids).size === ids.length, "Não repita pets na corrida."),
  price: z.string(),
  driverPrice: z.string(),
  scheduledAt: z.string(),
  origin: point,
  destination: point,
  stops: z.array(point).max(3, "Máximo de 3 paradas por corrida."),
  accompanies: z.boolean(),
  peopleCount: z.number().int().positive().nullable(),
  notes: z.string().trim().max(1000),
}).refine((d) => !d.accompanies || d.peopleCount !== null, "Informe quantas pessoas irão com o pet.");

export type FixedRideInput = z.infer<typeof fixedRideSchema>;

/** Valor fixado pela administração para o motorista: maior que zero e no máximo o valor pago pelo tutor. */
export function fixedDriverCents(value: string, priceCents: number) {
  const cents = fixedPriceCents(value);
  if (cents > priceCents) throw new Error("O valor do motorista não pode ser maior que o valor pago pelo tutor.");
  return cents;
}

export function parseFixedRide(input: FixedRideInput, now = Date.now()) {
  const data = fixedRideSchema.parse(input);
  const priceCents = fixedPriceCents(data.price);
  return {
    ...data,
    priceCents,
    driverFixedCents: fixedDriverCents(data.driverPrice, priceCents),
    scheduledAt: parseRescheduleInput(data.scheduledAt, true, now),
    peopleCount: data.accompanies ? data.peopleCount : null,
  };
}

export function assertFixedRideAdmin(isAdmin: boolean | null, error: unknown = null) {
  if (error || isAdmin !== true) throw new Error("Apenas administradores podem criar corridas fixas.");
}