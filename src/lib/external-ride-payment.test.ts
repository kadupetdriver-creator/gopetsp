import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canConfirmExternalRidePayment, validateExternalPaymentConfirmation } from "./external-ride-payment";

test("Somente administrador confirma Pix externo", () => {
  assert.throws(() => validateExternalPaymentConfirmation(false, true, "Pix recebido"));
  assert.equal(validateExternalPaymentConfirmation(true, true, " Pix recebido "), "Pix recebido");
});
test("Exige confirmação explícita do recebimento", () => {
  assert.throws(() => validateExternalPaymentConfirmation(true, false, "Pix recebido"));
});
test("Somente orçamento pendente não pago admite confirmação externa", () => {
  assert.equal(canConfirmExternalRidePayment({ status: "pending", paid_at: null }), true);
  assert.equal(canConfirmExternalRidePayment({ status: "pending", paid_at: "2026-11-16" }), false);
  for (const status of ["accepted", "en_route", "in_progress", "completed", "cancelled"]) {
    assert.equal(canConfirmExternalRidePayment({ status, paid_at: null }), false);
  }
});