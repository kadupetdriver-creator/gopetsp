/**
 * Valida se o endereço informado possui número ou "S/N".
 *
 * O Google Places costuma devolver o CEP no final do endereço formatado,
 * então não basta procurar qualquer dígito. Consideramos apenas o trecho
 * antes da sigla do estado (" - SP") e, dentro dele, o que vem depois da
 * primeira vírgula — onde o número da casa/prédio normalmente aparece.
 * Assim endereços como "Rua 25 de Março" sem número ainda são rejeitados.
 */
export function addressHasNumber(address: string): boolean {
  if (!address || typeof address !== "string") return false;

  // Isola tudo antes da sigla do estado, ex.: "São Paulo - SP"
  const beforeState = address.split(/ - [A-Z]{2}(?:,|$)/)[0] ?? address;

  // O número fica após o nome do logradouro, depois da primeira vírgula.
  const firstComma = beforeState.indexOf(",");
  const segment = firstComma >= 0 ? beforeState.slice(firstComma + 1) : beforeState;

  return /\d/.test(segment) || /\bs\/n\b/i.test(segment);
}
