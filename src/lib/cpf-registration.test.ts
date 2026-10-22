import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isValidCPF } from "./drivers";

async function cpfRpc(name: string, cpf: string) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração de teste do cadastro indisponível.");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ _cpf: cpf }),
  });
  assert.equal(response.ok, true, "A regra de CPF deve estar acessível no cadastro.");
  return response.json();
}

test("CPF 39729627894 permanece válido e disponível para múltiplas contas", async () => {
  assert.equal(isValidCPF("39729627894"), true);
  assert.equal(await cpfRpc("cpf_allows_multiple_accounts", "39729627894"), true);
  assert.equal(await cpfRpc("cpf_disponivel", "39729627894"), true);
});

test("a exceção normaliza o CPF com pontuação", async () => {
  assert.equal(await cpfRpc("cpf_allows_multiple_accounts", "397.296.278-94"), true);
  assert.equal(await cpfRpc("cpf_disponivel", "397.296.278-94"), true);
});

test("outros CPFs não recebem autorização para múltiplas contas", async () => {
  assert.equal(await cpfRpc("cpf_allows_multiple_accounts", "52998224725"), false);
  assert.equal(await cpfRpc("cpf_allows_multiple_accounts", "39729627895"), false);
});