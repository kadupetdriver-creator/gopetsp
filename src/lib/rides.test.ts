import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canTrackRide, isUnderwayStatus } from "./rides";

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