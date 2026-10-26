import { AlertTriangle } from "lucide-react";

/**
 * Destaque vermelho e em negrito exibido junto a todo campo de telefone:
 * números errados ou inválidos podem cancelar a corrida e inativar a conta.
 */
export function PhoneValidityWarning({ className = "" }: { className?: string }) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 rounded-lg border border-destructive/45 bg-destructive/10 px-3 py-2 text-sm font-bold leading-snug text-destructive ${className}`}
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        Números inseridos errados ou inválidos poderão ocasionar no cancelamento da corrida e
        inativação da conta.
      </span>
    </p>
  );
}
