export type DriverStatus = "pendente" | "em_analise" | "aprovado" | "rejeitado";
export type DocumentType = "cnh" | "crlv" | "comprovante_residencia";
export type DocumentStatus = "pendente" | "aprovado" | "rejeitado";

export const driverStatusLabels: Record<DriverStatus, string> = {
  pendente: "Aguardando revisão",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

export const driverStatusStyles: Record<DriverStatus, string> = {
  pendente: "bg-warning/20 text-warning-foreground",
  em_analise: "bg-primary/15 text-primary-ink",
  aprovado: "bg-success/15 text-success",
  rejeitado: "bg-destructive/10 text-destructive",
};

export const documentStatusLabels: Record<DocumentStatus, string> = {
  pendente: "Aguardando verificação",
  aprovado: "Verificado",
  rejeitado: "Recusado",
};

export const documentTypes: { value: DocumentType; label: string; hint: string }[] = [
  { value: "cnh", label: "CNH", hint: "Frente e verso ou uma única foto legível." },
  { value: "crlv", label: "CRLV do veículo", hint: "Documento do carro atualizado." },
  {
    value: "comprovante_residencia",
    label: "Comprovante de residência",
    hint: "Conta de luz, água ou telefone recente.",
  },
];

export const vehicleTypes: { value: string; label: string; capacity: string }[] = [
  { value: "hatch", label: "Hatch", capacity: "Pets pequenos e médios" },
  { value: "sedan", label: "Sedan", capacity: "Pets pequenos e médios" },
  { value: "suv", label: "SUV", capacity: "Pets de todos os portes" },
  { value: "van", label: "Van / utilitário", capacity: "Pets de todos os portes e múltiplos pets" },
];

export const vehicleColors = ["Branco", "Prata", "Preto", "Cinza", "Vermelho", "Azul", "Outra"];

export const ACCEPTED_DOC_TYPES = "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function maskCPF(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function isValidCPF(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function maskPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d{0,2})/, "($1");
  if (d.length <= 6) return d.replace(/(\d{2})(\d{0,4})/, "($1) $2");
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

export function isValidPhone(value: string) {
  const d = onlyDigits(value);
  return d.length === 10 || d.length === 11;
}

export function maskPlate(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
}

export function isValidPlate(value: string) {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(maskPlate(value));
}

export function isAdult(birthDate: string) {
  if (!birthDate) return false;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  const age =
    now.getFullYear() -
    birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  return age >= 18 && age < 100;
}

export function fileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  return file.type === "application/pdf" ? "pdf" : "jpg";
}
