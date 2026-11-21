import { strict as assert } from "node:assert";
import { test } from "node:test";
import { nextPendingReview, validPawRating } from "./review-flow";

  test("aceita somente as notas inteiras de 1 a 5", () => {
    assert.equal([1, 2, 3, 4, 5].every(validPawRating), true);
    assert.equal([0, 6, 2.5, NaN].some(validPawRating), false);
  });
  test("avaliar depois mantém a pendência para o próximo acesso", () => {
    const rows = [{ ride_id: "corrida-1" }, { ride_id: "corrida-2" }];
    assert.equal(nextPendingReview(rows, ["corrida-1"])?.ride_id, "corrida-2");
    assert.equal(nextPendingReview(rows, [])?.ride_id, "corrida-1");
  });
  test("uma corrida já avaliada deixa de gerar janela", () => {
    assert.equal(nextPendingReview([], []), null);
  });