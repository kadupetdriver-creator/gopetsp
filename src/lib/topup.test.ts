import { describe, expect, it } from "bun:test";
import { parseTopupCents } from "./topup";

describe("parseTopupCents", () => {
  it("aceita valor escolhido pelo tutor", () => expect(parseTopupCents("50,90")).toBe(5090));
  it("recusa abaixo do mínimo de R$ 10", () => expect(parseTopupCents("9,99")).toBeNull());
  it("recusa acima de R$ 2.000", () => expect(parseTopupCents("2000,01")).toBeNull());
  it("recusa texto inválido", () => expect(parseTopupCents("abc")).toBeNull());
});
