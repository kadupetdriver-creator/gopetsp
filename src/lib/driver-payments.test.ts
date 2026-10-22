import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canRecordDriverPayment, expectedDriverPaymentDate, reportDayBoundary, rideOccursWithin } from "./driver-payments";

test("Segunda a quinta têm previsão na sexta", () => {
  for (const day of [19, 20, 21, 22]) assert.equal(expectedDriverPaymentDate(`2026-10-${day}T15:00:00Z`).slice(0, 10), "2026-10-23");
});
test("Sexta a domingo têm previsão na segunda seguinte", () => {
  for (const day of [23, 24, 25]) assert.equal(expectedDriverPaymentDate(`2026-10-${day}T15:00:00Z`).slice(0, 10), "2026-10-26");
  assert.equal(expectedDriverPaymentDate("2026-10-24T01:00:00Z").slice(0, 10), "2026-10-26");
});
test("Relatório considera realização e limites de São Paulo, não criação ou pagamento do tutor", () => {
  const start = new Date(reportDayBoundary("2026-10-22"));
  const end = new Date(reportDayBoundary("2026-10-22", true));
  const ride = { created_at: "2026-10-01T12:00:00Z", paid_at: "2026-10-10T12:00:00Z", scheduled_at: "2026-10-23T02:59:59Z" };
  assert.equal(rideOccursWithin(ride.scheduled_at, start, end), true);
  assert.equal(rideOccursWithin(ride.created_at, start, end), false);
  assert.equal(rideOccursWithin(ride.paid_at, start, end), false);
  assert.equal(rideOccursWithin("2026-10-23T03:00:00Z", start, end), false);
  assert.equal(rideOccursWithin("2026-10-22T03:00:00Z", start, end), true);
});
test("Pagamento ao motorista só é registrável após conclusão de corrida paga atribuída", () => {
  const ride = { status: "completed", driver_id: "driver", paid_at: "2026-10-22" };
  assert.equal(canRecordDriverPayment(ride), true);
  for (const status of ["pending", "accepted", "en_route", "in_progress", "cancelled"]) assert.equal(canRecordDriverPayment({ ...ride, status }), false);
  assert.equal(canRecordDriverPayment({ ...ride, paid_at: null }), false);
  assert.equal(canRecordDriverPayment({ ...ride, driver_id: null }), false);
});