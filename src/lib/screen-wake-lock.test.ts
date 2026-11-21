import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createScreenWakeLock, screenWakeLockPreference, type ScreenLock } from "./screen-wake-lock";

function fixture() {
  let visible = true;
  let requests = 0;
  let releases = 0;
  const locks: ScreenLock[] = [];
  const controller = createScreenWakeLock({
    isVisible: () => visible,
    request: async () => {
      requests++;
      const lock: ScreenLock = {
        released: false,
        release: async () => { releases++; },
        addEventListener: () => {},
      };
      locks.push(lock);
      return lock;
    },
  });
  return { controller, hide: () => { visible = false; controller.visibilityChanged(); },
    show: () => { visible = true; controller.visibilityChanged(); },
    counts: () => ({ requests, releases }) };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("A opção é habilitada por padrão e respeita a desativação salva", () => {
  assert.equal(screenWakeLockPreference(null), true);
  assert.equal(screenWakeLockPreference("true"), true);
  assert.equal(screenWakeLockPreference("false"), false);
});
test("Tela operacional solicita bloqueio uma única vez", async () => {
  const f = fixture(); f.controller.setEnabled(true); f.show(); await flush(); f.show();
  assert.deepEqual(f.counts(), { requests: 1, releases: 0 });
  f.controller.dispose();
});
test("Minimizar libera e visibilitychange solicita novamente no retorno", async () => {
  const f = fixture(); f.controller.setEnabled(true); await flush(); f.hide(); f.show(); await flush();
  assert.deepEqual(f.counts(), { requests: 2, releases: 1 }); f.controller.dispose();
});
test("Desativar a opção restaura o bloqueio normal e não reativa no retorno", async () => {
  const f = fixture(); f.controller.setEnabled(true); await flush(); f.controller.setEnabled(false); f.hide(); f.show(); await flush();
  assert.deepEqual(f.counts(), { requests: 1, releases: 1 });
});
test("Sair da funcionalidade libera o bloqueio e ignora retornos posteriores", async () => {
  const f = fixture(); f.controller.setEnabled(true); await flush(); f.controller.dispose(); f.show(); await flush();
  assert.deepEqual(f.counts(), { requests: 1, releases: 1 });
});
test("Solicitação pendente é liberada se o usuário sair antes da resposta", async () => {
  let resolve: ((lock: ScreenLock) => void) | undefined;
  let releases = 0;
  const controller = createScreenWakeLock({ isVisible: () => true,
    request: () => new Promise<ScreenLock>((done) => { resolve = done; }) });
  controller.setEnabled(true); controller.dispose();
  assert.ok(resolve);
  resolve({ released: false, release: async () => { releases++; }, addEventListener: () => {} });
  await flush(); assert.equal(releases, 1);
});
test("Navegador incompatível não lança erro", () => {
  const controller = createScreenWakeLock({ isVisible: () => true });
  assert.doesNotThrow(() => { controller.setEnabled(true); controller.visibilityChanged(); controller.dispose(); });
});
test("Restrição de bateria é tratada sem repetição contínua", async () => {
  let requests = 0;
  const controller = createScreenWakeLock({ isVisible: () => true,
    request: async () => { requests++; throw new Error("NotAllowedError"); } });
  controller.setEnabled(true); await flush(); assert.equal(requests, 1);
  controller.visibilityChanged(); await flush(); assert.equal(requests, 2); controller.dispose();
});