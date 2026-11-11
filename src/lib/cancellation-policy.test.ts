import { describe, expect, it } from "vitest";
import { cancellationQuote } from "./cancellation-policy";

const now = new Date("2026-11-11T12:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
const base = { status: "accepted", price_cents: 10000, paid_at: "2026-11-01T00:00:00Z", driver_id: "d", arrived_at: null };

describe("política de cancelamento", () => {
  it("mais de 120 h é gratuito", () => {
    const q = cancellationQuote({ ...base, scheduled_at: at(120 + 1 / 60) }, now);
    expect(q.feeCents).toBe(0);
    expect(q.refundCents).toBe(10000);
  });
  it("exatamente 120 h cobra 30%", () => {
    const q = cancellationQuote({ ...base, scheduled_at: at(120) }, now);
    expect(q.ratePercent).toBe(30);
    expect(q.feeCents).toBe(3000);
    expect(q.refundCents).toBe(7000);
    expect(q.driverShareCents).toBe(2250);
  });
  it("motorista a caminho cobra 50%, sem somar", () => {
    const q = cancellationQuote({ ...base, status: "en_route", scheduled_at: at(1) }, now);
    expect(q.ratePercent).toBe(50);
    expect(q.feeCents).toBe(5000);
  });
  it("motorista no local cobra 50% mesmo com mais de 5 dias", () => {
    const q = cancellationQuote({ ...base, status: "en_route", arrived_at: at(0), scheduled_at: at(200) }, now);
    expect(q.tier).toBe("driver_arrived");
    expect(q.feeCents).toBe(5000);
  });
  it("exceção da GoPet zera a taxa", () => {
    const q = cancellationQuote({ ...base, status: "en_route", scheduled_at: at(1) }, now, true);
    expect(q.feeCents).toBe(0);
    expect(q.refundCents).toBe(10000);
  });
  it("corrida fixa: parcela do motorista proporcional ao valor fixo", () => {
    const q = cancellationQuote({ ...base, scheduled_at: at(10), driver_fixed_cents: 6000 }, now);
    expect(q.driverShareCents).toBe(1800);
  });
});
