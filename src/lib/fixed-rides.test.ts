import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assertFixedRideAdmin, fixedPriceCents, parseFixedRide, type FixedRideInput } from "./fixed-rides";

const input: FixedRideInput = {
  requestId: "00000000-0000-4000-8000-000000000001", tutorId: "00000000-0000-4000-8000-000000000002", petId: "00000000-0000-4000-8000-000000000003",
  price: "123,45", scheduledAt: "2026-11-01T10:00", origin: { address: "Rua Teste, 10, São Paulo", neighborhood: null, lat: -23.55, lng: -46.65 },
  destination: { address: "Rua Destino, 20, São Paulo", neighborhood: null, lat: -23.56, lng: -46.66 }, accompanies: false, peopleCount: null, notes: "",
};
test("Corrida fixa preserva exatamente o valor administrativo em centavos", () => {
  assert.equal(parseFixedRide(input, Date.parse("2026-10-28")).priceCents, 12345);
  assert.equal(fixedPriceCents("0,01"), 1);
  for (const value of ["0", "-10", "10,123", "abc"]) assert.throws(() => fixedPriceCents(value));
});
test("Somente administradores podem criar corrida fixa", () => {
  assert.doesNotThrow(() => assertFixedRideAdmin(true));
  for (const value of [false, null]) assert.throws(() => assertFixedRideAdmin(value));
  assert.throws(() => assertFixedRideAdmin(true, new Error("permission")));
});
test("Corrida fixa respeita área atendida, número e data futura em São Paulo", () => {
  const now = Date.parse("2026-10-28");
  assert.equal(parseFixedRide(input, now).scheduledAt, "2026-11-01T13:00:00.000Z");
  assert.throws(() => parseFixedRide({ ...input, origin: { ...input.origin, lat: -22 } }, now));
  assert.throws(() => parseFixedRide({ ...input, origin: { ...input.origin, address: "Rua Teste" } }, now));
  assert.throws(() => parseFixedRide({ ...input, scheduledAt: "2026-10-01T10:00" }, now));
});