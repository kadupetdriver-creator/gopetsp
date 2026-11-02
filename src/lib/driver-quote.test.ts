import { strict as assert } from "node:assert";
import { test } from "node:test";
import { calculateDriverQuote, canCreateDriverQuote, driverQuoteSchema, type DriverQuoteInput } from "./driver-quote";
import { calculateRidePrice } from "./pricing";

const input: DriverQuoteInput = {
  origin: { lat: -23.55, lng: -46.65, address: "Avenida Paulista, 1000" },
  destination: { lat: -23.56, lng: -46.66, address: "Rua Augusta, 200" },
  stops: [], petSizes: ["medio"], needsTrunk: false,
  scheduledAt: "2026-11-10T12:00:00Z", hasReturn: false, returnScheduledAt: null, driverWaits: false,
};
test("Orçamento do motorista usa o mesmo cálculo da solicitação", () => {
  assert.equal(calculateDriverQuote(input, 10, 20).priceCents, calculateRidePrice(10, ["medio"], false, {}, 20).priceCents);
  assert.equal(calculateDriverQuote(input, 10, 20).priceCents, 7679);
});
test("Retorno independente recebe um centavo a mais", () => {
  const price = calculateDriverQuote({ ...input, hasReturn: true, returnScheduledAt: "2026-11-10T13:00:00Z" }, 10, 20);
  assert.equal(price.returnFeeCents, price.oneWayCents + 1);
});
test("Espera mantém R$ 0,75 por minuto", () => {
  const price = calculateDriverQuote({ ...input, hasReturn: true, driverWaits: true, returnScheduledAt: "2026-11-10T13:00:00Z" }, 10, 20);
  assert.equal(price.waitingFeeCents, 4500);
});
test("Criar orçamento é exclusivo de motorista ativo", () => {
  assert.equal(canCreateDriverQuote({ role: "driver", is_active: true }), true);
  assert.equal(canCreateDriverQuote({ role: "tutor", is_active: true }), false);
  assert.equal(canCreateDriverQuote({ role: "driver", is_active: false }), false);
});
test("Orçamento mantém até três pets e paradas em São Paulo", () => {
  assert.equal(driverQuoteSchema.safeParse(input).success, true);
  assert.equal(driverQuoteSchema.safeParse({ ...input, petSizes: ["mini", "mini", "mini", "mini"] }).success, false);
  assert.equal(driverQuoteSchema.safeParse({ ...input, stops: Array(4).fill(input.origin) }).success, false);
  assert.equal(driverQuoteSchema.safeParse({ ...input, origin: { ...input.origin, lat: -22 } }).success, false);
});