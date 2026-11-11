import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cancellationQuote } from "./cancellation-policy";

const now = new Date("2026-11-11T12:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
const base = { status: "accepted", price_cents: 10000, paid_at: "2026-11-01T00:00:00Z", driver_id: "d", arrived_at: null };

test("mais de 120 h é gratuito", () => {
  const q = cancellationQuote({ ...base, scheduled_at: at(120 + 1 / 60) }, now);
  assert.equal(q.feeCents, 0);
  assert.equal(q.refundCents, 10000);
});
test("exatamente 120 h cobra 30% e motorista recebe 75% da taxa", () => {
  const q = cancellationQuote({ ...base, scheduled_at: at(120) }, now);
  assert.equal(q.feeCents, 3000);
  assert.equal(q.refundCents, 7000);
  assert.equal(q.driverShareCents, 2250);
});
test("motorista a caminho cobra 50%, sem somar", () => {
  const q = cancellationQuote({ ...base, status: "en_route", scheduled_at: at(1) }, now);
  assert.equal(q.feeCents, 5000);
});
test("motorista no local cobra 50% mesmo com mais de 5 dias", () => {
  const q = cancellationQuote({ ...base, status: "en_route", arrived_at: at(0), scheduled_at: at(200) }, now);
  assert.equal(q.tier, "driver_arrived");
  assert.equal(q.feeCents, 5000);
});
test("exceção zera a taxa", () => {
  const q = cancellationQuote({ ...base, status: "en_route", scheduled_at: at(1) }, now, true);
  assert.equal(q.feeCents, 0);
  assert.equal(q.refundCents, 10000);
});
test("corrida fixa: parcela proporcional ao valor fixo", () => {
  const q = cancellationQuote({ ...base, scheduled_at: at(10), driver_fixed_cents: 6000 }, now);
  assert.equal(q.driverShareCents, 1800);
});
