import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTopupCents } from "./topup";

test("aceita valor escolhido pelo tutor", () => assert.equal(parseTopupCents("50,90"), 5090));
test("recusa abaixo do mínimo de R$ 10", () => assert.equal(parseTopupCents("9,99"), null));
test("recusa acima de R$ 2.000", () => assert.equal(parseTopupCents("2000,01"), null));
test("recusa texto inválido", () => assert.equal(parseTopupCents("abc"), null));
