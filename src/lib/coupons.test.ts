import { test } from "node:test";
import assert from "node:assert/strict";
import { couponAmountCents } from "./coupons";

test("cupom de boas-vindas desconta R$ 5,00", () => {
  assert.equal(couponAmountCents(3000, { discount_percent: 0, discount_cents: 500 }), 2500);
});

test("cupom de indicação continua com 20%", () => {
  assert.equal(couponAmountCents(3000, { discount_percent: 20, discount_cents: 0 }), 2400);
});
