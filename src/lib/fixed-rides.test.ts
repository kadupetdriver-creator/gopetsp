import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assertFixedRideAdmin, fixedPriceCents, parseFixedRide, type FixedRideInput } from "./fixed-rides";

const input: FixedRideInput = {
  requestId: "00000000-0000-4000-8000-000000000001", tutorId: "00000000-0000-4000-8000-000000000002", petIds: ["00000000-0000-4000-8000-000000000003"], stops: [],
  price: "123,45", driverPrice: "92,58", scheduledAt: "2026-11-01T10:00", origin: { address: "Rua Teste, 10, São Paulo", neighborhood: null, lat: -23.55, lng: -46.65 },
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
test("Vários pets preservam o preço fixo e respeitam o limite de três sem duplicação", () => {
  const petIds = [...input.petIds, "00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000005"];
  const parsed = parseFixedRide({ ...input, petIds }, Date.parse("2026-10-28"));
  assert.deepEqual(parsed.petIds, petIds);
  assert.equal(parsed.priceCents, 12345);
  assert.throws(() => parseFixedRide({ ...input, petIds: [] }));
  assert.throws(() => parseFixedRide({ ...input, petIds: [...petIds, input.tutorId] }));
  assert.throws(() => parseFixedRide({ ...input, petIds: [input.requestId, input.requestId] }));
});
test("Paradas mantêm ordem e preço fixo, exigindo endereços válidos e no máximo três", () => {
  const stops = [input.destination, input.origin];
  const parsed = parseFixedRide({ ...input, stops }, Date.parse("2026-10-28"));
  assert.deepEqual(parsed.stops, stops);
  assert.equal(parsed.priceCents, 12345);
  assert.throws(() => parseFixedRide({ ...input, stops: [{ ...input.origin, address: "Rua sem número" }] }));
  assert.throws(() => parseFixedRide({ ...input, stops: Array(4).fill(input.origin) }));
});
test("Corrida fixa respeita área atendida, número e data futura em São Paulo", () => {
  const now = Date.parse("2026-10-28");
  assert.equal(parseFixedRide(input, now).scheduledAt, "2026-11-01T13:00:00.000Z");
  assert.throws(() => parseFixedRide({ ...input, origin: { ...input.origin, lat: -22 } }, now));
  assert.throws(() => parseFixedRide({ ...input, origin: { ...input.origin, address: "Rua Teste" } }, now));
  assert.throws(() => parseFixedRide({ ...input, scheduledAt: "2026-10-01T10:00" }, now));
});
test("Corrida fixa fixa o valor do motorista definido pela administração", () => {
  const parsed = parseFixedRide(input, Date.parse("2026-10-28"));
  assert.equal(parsed.driverFixedCents, 9258);
  assert.equal(parseFixedRide({ ...input, driverPrice: "123,45" }, Date.parse("2026-10-28")).driverFixedCents, 12345);
  for (const value of ["123,46", "0", "abc", ""]) assert.throws(() => parseFixedRide({ ...input, driverPrice: value }, Date.parse("2026-10-28")));
});