import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canTrackRide, isUnderwayStatus, sortRidesChronologically } from "./rides";

test("Em andamento começa em A caminho e não inclui disponíveis ou apenas aceitas", () => {
  assert.equal(isUnderwayStatus("pending"), false);
  assert.equal(isUnderwayStatus("accepted"), false);
  assert.equal(isUnderwayStatus("en_route"), true);
  assert.equal(isUnderwayStatus("in_progress"), true);
  assert.equal(isUnderwayStatus("completed"), false);
  assert.equal(isUnderwayStatus("cancelled"), false);
});

test("Tutor acompanha ao vivo somente após A caminho, nunca só pelo aceite", () => {
  assert.equal(canTrackRide("pending"), false);
  assert.equal(canTrackRide("accepted"), false);
  assert.equal(canTrackRide("en_route"), true);
  assert.equal(canTrackRide("in_progress"), true);
  assert.equal(canTrackRide("completed"), false);
  assert.equal(canTrackRide("cancelled"), false);
});

test("Ordem cronológica: ativas das mais antigas às mais novas e finalizadas das mais novas às mais antigas", () => {
  const rides = [
    { status: "completed" as const, scheduled_at: "2026-11-01T09:00:00+00:00" },
    { status: "accepted" as const, scheduled_at: "2026-11-05T10:00:00+00:00" },
    { status: "cancelled" as const, scheduled_at: "2026-11-02T09:00:00+00:00" },
    { status: "pending" as const, scheduled_at: "2026-11-03T08:00:00+00:00" },
    { status: "en_route" as const, scheduled_at: "2026-11-04T08:00:00+00:00" },
    { status: "completed" as const, scheduled_at: "2026-11-02T09:00:00+00:00" },
  ];
  const sorted = sortRidesChronologically(rides).map((r) => r.scheduled_at);
  assert.deepEqual(sorted, [
    "2026-11-03T08:00:00+00:00",
    "2026-11-04T08:00:00+00:00",
    "2026-11-05T10:00:00+00:00",
    "2026-11-02T09:00:00+00:00",
    "2026-11-02T09:00:00+00:00",
    "2026-11-01T09:00:00+00:00",
  ]);
});