import { strict as assert } from "node:assert";
import { test } from "node:test";
import { earningsRangeError, matchesEarningsRange } from "./driver-earnings-range";

test("Filtro inclui todo o dia da realização em São Paulo, independentemente da data UTC", () => {
  assert.equal(matchesEarningsRange("2026-10-22T03:00:00Z", "2026-10-22", "2026-10-22"), true);
  assert.equal(matchesEarningsRange("2026-10-23T02:59:59.999Z", "2026-10-22", "2026-10-22"), true);
  assert.equal(matchesEarningsRange("2026-10-22T02:59:59.999Z", "2026-10-22", "2026-10-22"), false);
  assert.equal(matchesEarningsRange("2026-10-23T03:00:00Z", "2026-10-22", "2026-10-22"), false);
});

test("Datas opcionais permitem início ou fim isolado e limpar retorna todos os rendimentos", () => {
  assert.equal(matchesEarningsRange("2026-10-23T15:00:00Z", "2026-10-22", ""), true);
  assert.equal(matchesEarningsRange("2026-10-21T15:00:00Z", "2026-10-22", ""), false);
  assert.equal(matchesEarningsRange("2026-10-21T15:00:00Z", "", "2026-10-22"), true);
  assert.equal(matchesEarningsRange("2026-10-23T15:00:00Z", "", "2026-10-22"), false);
  assert.equal(matchesEarningsRange("2026-01-01T15:00:00Z", "", ""), true);
});

test("Período invertido não apresenta rendimentos enganosos", () => {
  assert.ok(earningsRangeError("2026-10-23", "2026-10-22"));
  assert.equal(matchesEarningsRange("2026-10-22T15:00:00Z", "2026-10-23", "2026-10-22"), false);
  assert.equal(earningsRangeError("2026-10-22", "2026-10-22"), null);
});