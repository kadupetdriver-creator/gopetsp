/** Área de atendimento padrão (Grande São Paulo) e exceções nacionais por usuário. */
export const SP_BOUNDS = { minLat: -24.1, maxLat: -23.1, minLng: -47.1, maxLng: -46.05 };
export const NATIONWIDE_DRIVER_CPFS = ["39729627894"];
export const NATIONWIDE_USER_EMAILS = ["kadupetdriver@gmail.com"];

export function isInSaoPaulo(lat: number, lng: number): boolean {
  return lat >= SP_BOUNDS.minLat && lat <= SP_BOUNDS.maxLat && lng >= SP_BOUNDS.minLng && lng <= SP_BOUNDS.maxLng;
}

export function hasNationwideMap(profile: { role?: string | null; cpf?: string | null; email?: string | null } | null): boolean {
  if (!profile) return false;
  const email = String(profile.email ?? "").trim().toLowerCase();
  if (NATIONWIDE_USER_EMAILS.includes(email)) return true;
  if (profile.role !== "driver") return false;
  const digits = String(profile.cpf ?? "").replace(/\D/g, "");
  return NATIONWIDE_DRIVER_CPFS.includes(digits);
}
