import { isValidCPF, isValidPhone, onlyDigits } from "./drivers";

export function validRegistrationEmail(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim() ?? "");
}

export function needsGoogleProfileCompletion(
  user: { email?: string; app_metadata: { provider?: string; providers?: string[] } | null } | null,
  profile: { cpf?: string | null; phone?: string | null } | null,
) {
  const google = user?.app_metadata?.provider === "google" || user?.app_metadata?.providers?.includes("google");
  return !!google && (!profile || !isValidCPF(profile.cpf ?? "") || !isValidPhone(profile.phone ?? "") || !validRegistrationEmail(user?.email));
}

export function parseCompletion(input: { cpf: string; phone: string; email: string }) {
  if (!isValidCPF(input.cpf)) throw new Error("CPF inválido. Confira os números digitados.");
  if (!isValidPhone(input.phone)) throw new Error("Informe um telefone válido com DDD, com 10 ou 11 dígitos.");
  if (!validRegistrationEmail(input.email)) throw new Error("Informe um e-mail válido.");
  return { cpf: onlyDigits(input.cpf), phone: onlyDigits(input.phone), email: input.email.trim().toLowerCase() };
}

export function canSetRegistrationCpf(current: string | null, next: string) {
  return !isValidCPF(current ?? "") || onlyDigits(current ?? "") === next;
}