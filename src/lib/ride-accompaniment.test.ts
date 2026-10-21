import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTutorAccompaniment, parseAccompanyingPeopleCount } from "./ride-accompaniment";

test("Pedido preserva tanto Sim quanto Não para tutor acompanhando o pet", () => {
  assert.equal(parseTutorAccompaniment(true), true);
  assert.equal(parseTutorAccompaniment(false), false);
  assert.throws(() => parseTutorAccompaniment("false"));
});

test("Pedidos antigos sem resposta não são classificados como sem tutor", () => {
  assert.equal(parseTutorAccompaniment(undefined), null);
  assert.equal(parseTutorAccompaniment(null), null);
});

test("Se o tutor acompanha, quantidade de pessoas deve ser inteira e positiva", () => {
  assert.equal(parseAccompanyingPeopleCount(true, 1), 1);
  assert.equal(parseAccompanyingPeopleCount(true, 2), 2);
  for (const invalid of [0, -1, 1.5, "2", NaN]) {
    assert.throws(() => parseAccompanyingPeopleCount(true, invalid));
  }
});

test("Sem tutor a quantidade é removida; pedidos antigos preservam desconhecido", () => {
  assert.equal(parseAccompanyingPeopleCount(false, 2), null);
  assert.equal(parseAccompanyingPeopleCount(true, undefined), null);
});