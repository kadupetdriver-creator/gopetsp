import { expect, test } from "bun:test";
import { isUnderwayStatus } from "./rides";

test("Em andamento começa em A caminho e não inclui disponíveis ou apenas aceitas", () => {
  expect(isUnderwayStatus("pending")).toBe(false);
  expect(isUnderwayStatus("accepted")).toBe(false);
  expect(isUnderwayStatus("en_route")).toBe(true);
  expect(isUnderwayStatus("in_progress")).toBe(true);
  expect(isUnderwayStatus("completed")).toBe(false);
  expect(isUnderwayStatus("cancelled")).toBe(false);
});