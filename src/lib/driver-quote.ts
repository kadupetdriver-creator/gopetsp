import { z } from "zod";
import { SIZE_RANK } from "./pet-sizes";
import { calculateRidePrice } from "./pricing";
import { addressHasNumber } from "./address";

const point = z.object({
  lat: z.number().finite().min(-34).max(6),
  lng: z.number().finite().min(-74).max(-34),
  address: z.string().trim().min(1).max(300).refine(addressHasNumber, "Informe o número do endereço ou S/N."),
});

export const driverQuoteSchema = z.object({
  origin: point,
  destination: point,
  stops: z.array(point).max(3),
  petSizes: z.array(z.string().refine((size) => SIZE_RANK.includes(size), "Porte inválido.")).min(1).max(3),
  needsTrunk: z.boolean(),
  scheduledAt: z.string().datetime({ offset: true }),
  hasReturn: z.boolean(),
  returnScheduledAt: z.string().datetime({ offset: true }).nullable(),
  driverWaits: z.boolean(),
}).refine((input) => !input.hasReturn || (input.returnScheduledAt !== null && new Date(input.returnScheduledAt) > new Date(input.scheduledAt)), {
  message: "Informe um horário de retorno posterior à ida.",
  path: ["returnScheduledAt"],
});

export type DriverQuoteInput = z.infer<typeof driverQuoteSchema>;

export function canCreateDriverQuote(profile: { role: string; is_active: boolean } | null) {
  return profile?.role === "driver" && profile.is_active === true;
}

export function calculateDriverQuote(input: DriverQuoteInput, distanceKm: number, durationMinutes: number) {
  const waitingMinutes = input.hasReturn && input.driverWaits && input.returnScheduledAt
    ? Math.max(0, Math.ceil((new Date(input.returnScheduledAt).getTime() - new Date(input.scheduledAt).getTime()) / 60000)) : 0;
  const price = calculateRidePrice(distanceKm, input.petSizes, input.needsTrunk, {
    hasReturn: input.hasReturn && input.driverWaits,
    waitingMinutes,
  }, durationMinutes);
  const returnFeeCents = input.hasReturn && !input.driverWaits ? price.oneWayCents + 1 : price.returnFeeCents;
  return { ...price, returnFeeCents, priceCents: price.oneWayCents + returnFeeCents + price.waitingFeeCents, distanceKm, durationMinutes };
}