import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canPayWithGoPetBalance } from "./credit-payment";

test("Saldo GoPet paga integralmente uma corrida quando há saldo suficiente", () => {
  assert.equal(canPayWithGoPetBalance(100, 100, false), true);
  assert.equal(canPayWithGoPetBalance(99, 100, false), false);
  assert.equal(canPayWithGoPetBalance(undefined, 100, false), false);
  assert.equal(canPayWithGoPetBalance(100, 0, false), false);
});

test("Saldo não compete com pagamento Mercado Pago aguardando confirmação", () => {
  assert.equal(canPayWithGoPetBalance(100, 100, true), false);
  assert.equal(canPayWithGoPetBalance(100, 100, false), true);
});