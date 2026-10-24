import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canEditDriverApplication } from "./drivers";

test("cadastro devolvido permite atualização e reenvio", () => {
  assert.equal(canEditDriverApplication("rejeitado", false), true);
  assert.equal(canEditDriverApplication("pendente", false), true);
  assert.equal(canEditDriverApplication("em_analise", false), false);
});

test("recusa definitiva impede atualização e reenvio", () => {
  assert.equal(canEditDriverApplication("rejeitado", true), false);
  assert.equal(canEditDriverApplication("pendente", true), false);
});