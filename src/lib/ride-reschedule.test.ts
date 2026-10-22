import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canAdminRescheduleRide, parseRescheduleInput, saoPauloScheduleInput } from "./ride-reschedule";

test("Reagendamento exige solicitação do tutor", () => {
  assert.throws(() => parseRescheduleInput("2026-11-01T10:00", false, 0), /tutor/);
  assert.equal(parseRescheduleInput("2026-11-01T10:00", true, 0), "2026-11-01T13:00:00.000Z");
});
test("Agendamento usa horário de São Paulo e rejeita datas inválidas ou passadas", () => {
  assert.equal(saoPauloScheduleInput("2026-11-01T13:00:00Z"), "2026-11-01T10:00");
  assert.throws(() => parseRescheduleInput("2026-02-30T10:00", true, 0), /válidos/);
  assert.throws(() => parseRescheduleInput("2026-11-01T10:00", true, Date.parse("2026-11-01T13:00:00Z")), /futuros/);
});
test("Corridas iniciadas ou encerradas não podem ser reagendadas", () => {
  assert.equal(canAdminRescheduleRide("pending"), true);
  assert.equal(canAdminRescheduleRide("accepted"), true);
  for (const status of ["en_route", "in_progress", "completed", "cancelled"]) assert.equal(canAdminRescheduleRide(status), false);
});