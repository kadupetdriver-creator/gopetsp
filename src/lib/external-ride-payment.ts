export function canConfirmExternalRidePayment(ride: { status: string; paid_at: string | null }) {
  return ride.status === "pending" && ride.paid_at === null;
}

export function validateExternalPaymentConfirmation(isAdmin: boolean, confirmed: boolean, note: string) {
  if (!isAdmin) throw new Error("Apenas administradores podem confirmar pagamentos externos.");
  if (!confirmed) throw new Error("Confirme o recebimento integral do Pix fora da plataforma.");
  const trimmed = note.trim();
  if (trimmed.length < 5 || trimmed.length > 500) throw new Error("Informe uma observação de 5 a 500 caracteres.");
  return trimmed;
}