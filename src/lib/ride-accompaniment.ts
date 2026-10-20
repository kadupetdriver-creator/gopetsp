/** Preserve unknown on legacy requests; never mistake missing information for No. */
export function parseTutorAccompaniment(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new Error("Informe se o tutor vai acompanhar o pet.");
  return value;
}

export function tutorAccompanimentLabel(value: boolean | null | undefined): string {
  if (value === true) return "Tutor acompanha o pet";
  if (value === false) return "Pet vai sem o tutor";
  return "Acompanhamento do tutor não informado";
}