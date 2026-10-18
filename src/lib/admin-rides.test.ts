import { strict as assert } from "node:assert";
import { test } from "node:test";
import { adminRideAmounts, canAdminCompleteRide, matchesAdminRideFilter } from "./admin-rides";
import type { RideStatus } from "./rides";

test("Aceitas não duplica corridas A caminho ou Em andamento", () => {
  const ride = { driver_id: "driver", paid_at: "2026-10-18" };
  assert.equal(matchesAdminRideFilter({ ...ride, status: "accepted" }, "aceitas"), true);
  for (const status of ["en_route", "in_progress"] as RideStatus[]) {
    assert.equal(matchesAdminRideFilter({ ...ride, status }, "aceitas"), false);
    assert.equal(matchesAdminRideFilter({ ...ride, status }, "andamento"), true);
  }
});

test("Disponíveis mostram valor total e parcela de 75% sem motorista atribuído", () => {
  assert.equal(matchesAdminRideFilter({ status: "pending", driver_id: null, paid_at: "2026-10-18" }, "disponiveis"), true);
  assert.deepEqual(adminRideAmounts(10000), { totalCents: 10000, driverCents: 7500 });
});

test("Admin pode finalizar corrida paga com motorista que esqueceu de encerrar", () => {
  const ride = { driver_id: "driver", paid_at: "2026-10-18" };
  for (const status of ["accepted", "en_route", "in_progress"] as RideStatus[]) {
    assert.equal(canAdminCompleteRide({ ...ride, status }), true);
  }
  for (const status of ["pending", "completed", "cancelled"] as RideStatus[]) {
    assert.equal(canAdminCompleteRide({ ...ride, status }), false);
  }
  assert.equal(canAdminCompleteRide({ ...ride, status: "in_progress", driver_id: null }), false);
  assert.equal(canAdminCompleteRide({ ...ride, status: "in_progress", paid_at: null }), false);
});