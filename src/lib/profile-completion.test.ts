import { strict as assert } from "node:assert";
import { test } from "node:test";
import { needsGoogleProfileCompletion, parseCompletion, canSetRegistrationCpf } from "./profile-completion";

const user = { email: "tutor@example.com", app_metadata: { providers: ["google"] } };
const profile = { cpf: "52998224725", phone: "11999999999" };

test("Google exige CPF válido antes de acessar o app", () => {
  assert.equal(needsGoogleProfileCompletion(user, { ...profile, cpf: null }), true);
  assert.throws(() => parseCompletion({ ...profile, cpf: "11111111111", email: user.email }));
});
test("Google exige telefone com DDD antes de acessar o app", () => {
  assert.equal(needsGoogleProfileCompletion(user, { ...profile, phone: "" }), true);
  assert.throws(() => parseCompletion({ ...profile, phone: "999999999", email: user.email }));
});
test("Google exige e-mail válido antes de acessar o app", () => {
  assert.equal(needsGoogleProfileCompletion({ ...user, email: "" }, profile), true);
  assert.throws(() => parseCompletion({ ...profile, email: "sem-email" }));
});
test("Google completo pode acessar; perfil ausente bloqueia e login por senha não é alterado", () => {
  assert.equal(needsGoogleProfileCompletion({ email: user.email, app_metadata: null }, null), false);
  assert.equal(needsGoogleProfileCompletion(null, null), false);
  assert.equal(needsGoogleProfileCompletion(user, profile), false);
  assert.equal(needsGoogleProfileCompletion(user, null), true);
  assert.equal(needsGoogleProfileCompletion({ ...user, app_metadata: { provider: "email" } }, null), false);
});
test("Conclusão normaliza documentos sem permitir trocar CPF válido cadastrado", () => {
  assert.deepEqual(parseCompletion({ cpf: "529.982.247-25", phone: "(11) 99999-9999", email: " tutor@example.com " }), { ...profile, email: user.email });
  assert.equal(canSetRegistrationCpf(null, profile.cpf), true);
  assert.equal(canSetRegistrationCpf(profile.cpf, "11144477735"), false);
});