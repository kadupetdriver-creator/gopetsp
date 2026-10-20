import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTutorAccompaniment } from "./ride-accompaniment";

test("Pedido preserva tanto Sim quanto Não para tutor acompanhando o pet", () => {
  assert.equal(parseTutorAccompaniment(true), true);
  assert.equal(parseTutorAccompaniment(false), false);
  assert.throws(() => parseTutorAccompaniment("false"));
});

test("Pedidos antigos sem resposta não são classificados como sem tutor", () => {
  assert.equal(parseTutorAccompaniment(undefined), null);
  assert.equal(parseTutorAccompaniment(null), null);
});