import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isUnderwayStatus } from "./rides";

test("Em andamento começa em A caminho e não inclui disponíveis ou apenas aceitas", () => {
  assert.equal(isUnderwayStatus("pending"), false);
  assert.equal(isUnderwayStatus("accepted"), false);
  assert.equal(isUnderwayStatus("en_route"), true);
  assert.equal(isUnderwayStatus("in_progress"), true);
  assert.equal(isUnderwayStatus("completed"), false);
  assert.equal(isUnderwayStatus("cancelled"), false);
});