import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canRequestRideDriver, isRideReleased } from "./ride-request";

test("Chamar motorista só é permitido após pagamento confirmado", () => {
  const ride = { status: "pending", paid_at: null, driver_requested_at: null };
  assert.equal(canRequestRideDriver(ride), false);
  assert.equal(canRequestRideDriver({ ...ride, paid_at: "2026-10-22" }), true);
  assert.equal(canRequestRideDriver({ ...ride, paid_at: "2026-10-22", status: "cancelled" }), false);
});

test("Pagamento sozinho não libera corrida; comando confirmado libera uma única vez", () => {
  const paid = { status: "pending", paid_at: "2026-10-22", driver_requested_at: null };
  assert.equal(isRideReleased(paid), false);
  const requested = { ...paid, driver_requested_at: "2026-10-22T00:20:00Z" };
  assert.equal(isRideReleased(requested), true);
  assert.equal(canRequestRideDriver(requested), false);
  assert.equal(isRideReleased({ ...requested, paid_at: null }), false);
});