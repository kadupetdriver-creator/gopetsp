import { strict as assert } from "node:assert";
import { test } from "node:test";
import { adminRideAmounts, canAdminCompleteRide, canAdminForwardRide, matchesAdminRideFilter } from "./admin-rides";
import type { RideStatus } from "./rides";

test("Administração só lista corridas com pagamento aprovado em todos os filtros de corridas", () => {
  for (const status of ["pending", "accepted", "en_route", "in_progress", "completed", "cancelled"] as RideStatus[]) {
    const ride = { status, driver_id: "driver", paid_at: null, driver_requested_at: "2026-10-22" };
    for (const filter of ["todas", "disponiveis", "aceitas", "andamento", "completed", "cancelled"] as const) {
      assert.equal(matchesAdminRideFilter(ride, filter), false);
    }
    assert.equal(matchesAdminRideFilter({ ...ride, paid_at: "2026-10-22" }, "todas"), true);
  }
});

test("Pagamento pendente aparece somente em Orçamentos e sai após aprovação", () => {
  const ride = { status: "pending" as const, driver_id: null, paid_at: null, driver_requested_at: null };
  assert.equal(matchesAdminRideFilter(ride, "orcamentos"), true);
  const approved = { ...ride, paid_at: "2026-10-22" };
  assert.equal(matchesAdminRideFilter(approved, "orcamentos"), false);
  assert.equal(matchesAdminRideFilter(approved, "todas"), true);
  assert.equal(matchesAdminRideFilter(approved, "disponiveis"), true);
});

test("Aceitas não duplica corridas A caminho ou Em andamento", () => {
  const ride = { driver_id: "driver", paid_at: "2026-10-18" };
  assert.equal(matchesAdminRideFilter({ ...ride, status: "accepted" }, "aceitas"), true);
  for (const status of ["en_route", "in_progress"] as RideStatus[]) {
    assert.equal(matchesAdminRideFilter({ ...ride, status }, "aceitas"), false);
    assert.equal(matchesAdminRideFilter({ ...ride, status }, "andamento"), true);
  }
});

test("Disponíveis mostram valor total e parcela de 75% sem motorista atribuído", () => {
  assert.equal(matchesAdminRideFilter({ status: "pending", driver_id: null, paid_at: "2026-10-18", driver_requested_at: "2026-10-18" }, "disponiveis"), true);
  assert.equal(matchesAdminRideFilter({ status: "pending", driver_id: null, paid_at: "2026-10-18", driver_requested_at: null }, "disponiveis"), true);
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

test("Admin pode encaminhar corrida paga sem comando do tutor, mas nunca orçamento ou transporte encerrado", () => {
  const ride = { driver_id: null, paid_at: "2026-10-22", driver_requested_at: null };
  for (const status of ["pending", "accepted", "en_route"] as RideStatus[]) {
    assert.equal(canAdminForwardRide({ ...ride, status }), true);
    assert.equal(canAdminForwardRide({ ...ride, status, paid_at: null }), false);
  }
  for (const status of ["in_progress", "completed", "cancelled"] as RideStatus[]) {
    assert.equal(canAdminForwardRide({ ...ride, status }), false);
  }
});