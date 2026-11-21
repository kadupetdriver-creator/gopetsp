import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatRatingAverage, isLowRating, matchesRatingFilter, recentRatingAverage, reviewPeriodBounds } from "./review-stats";

test("média considera somente as 100 avaliações mais recentes", () => {
  const ratings = [...Array<number>(100).fill(5), ...Array<number>(50).fill(1)];
  assert.equal(recentRatingAverage(ratings), 5);
});

test("média usa todas as avaliações quando há menos de 100", () => {
  assert.equal(recentRatingAverage([5, 4, 4]), 4.33);
});

test("média é exibida com duas casas decimais", () => {
  assert.equal(formatRatingAverage(4.5, 2), "4,50");
  assert.equal(formatRatingAverage("5", 1), "5,00");
});

test("usuário novo mostra Sem avaliações", () => {
  assert.equal(formatRatingAverage(null, 0), "Sem avaliações");
  assert.equal(recentRatingAverage([]), null);
});

test("notas iguais ou inferiores a 2 patinhas são destacadas", () => {
  assert.equal(isLowRating(2), true);
  assert.equal(isLowRating(1), true);
  assert.equal(isLowRating(3), false);
});

test("filtro por nota exata ou notas baixas", () => {
  assert.equal(matchesRatingFilter(2, "low"), true);
  assert.equal(matchesRatingFilter(3, "low"), false);
  assert.equal(matchesRatingFilter(4, "4"), true);
  assert.equal(matchesRatingFilter(5, "4"), false);
});

test("período usa dias inteiros no horário de São Paulo", () => {
  assert.deepEqual(reviewPeriodBounds("2026-11-01", "2026-11-02"), {
    from: "2026-11-01T03:00:00.000Z",
    to: "2026-11-03T02:59:59.999Z",
  });
});
