import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  detectInstallPlatform,
  INSTALL_DISMISS_DURATION_MS,
  shouldShowInstallInvite,
} from "./pwa-install";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");

test("O primeiro acesso ao navegador apresenta o convite", () => {
  assert.equal(shouldShowInstallInvite({ installed: false, dismissedAt: null, now: NOW }), true);
});

test("A recusa impede um novo convite durante 24 horas", () => {
  const dismissedAt = String(NOW);
  assert.equal(shouldShowInstallInvite({ installed: false, dismissedAt, now: NOW + INSTALL_DISMISS_DURATION_MS - 1 }), false);
  assert.equal(shouldShowInstallInvite({ installed: false, dismissedAt, now: NOW + INSTALL_DISMISS_DURATION_MS }), true);
});

test("Aplicativo instalado nunca recebe o convite automático", () => {
  assert.equal(shouldShowInstallInvite({ installed: true, dismissedAt: null, now: NOW }), false);
});

test("Um registro de recusa inválido não bloqueia o convite", () => {
  assert.equal(shouldShowInstallInvite({ installed: false, dismissedAt: "inválido", now: NOW }), true);
});

test("As instruções distinguem Android, iPhone e outros navegadores", () => {
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Linux; Android 15) Chrome/142.0"), "android");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) Safari/604.1"), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/145.0"), "other");
});
