/** Preserve unknown on legacy requests; never mistake missing information for No. */
export function parseTutorAccompaniment(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new Error("Informe se o tutor vai acompanhar o pet.");
  return value;
}

export function parseAccompanyingPeopleCount(accompanies: boolean | null, value: unknown): number | null {
  if (accompanies !== true || value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Informe quantas pessoas vão com o pet, incluindo o tutor.");
  }
  return value;
}

export function tutorAccompanimentLabel(value: boolean | null | undefined, count?: number | null): string {
  if (value === true) return count
    ? `Tutor acompanha o pet · ${count} ${count === 1 ? "pessoa" : "pessoas"}`
    : "Tutor acompanha o pet";
  if (value === false) return "Pet vai sem o tutor";
  return "Acompanhamento do tutor não informado";
}