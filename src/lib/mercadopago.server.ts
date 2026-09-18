import { createHmac, timingSafeEqual } from "node:crypto";

const MP_API = "https://api.mercadopago.com";

export type MercadoPagoPayment = {
  id: number;
  status: string;
  status_detail?: string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  transaction_amount: number;
  external_reference?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string };
  } | null;
};

function accessToken() {
  const token = process.env["MP_ACCESS_TOKEN"];
  if (!token) throw new Error("Mercado Pago ainda não foi configurado.");
  return token;
}

export async function mercadoPagoRequest<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken()}`);
  headers.set("Content-Type", "application/json");
  if (init.idempotencyKey) headers.set("X-Idempotency-Key", init.idempotencyKey);
  const response = await fetch(`${MP_API}${path}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    console.error("Mercado Pago request failed", response.status, body);
    throw new Error(paymentErrorMessage(response.status, body));
  }
  return body as T;
}

export function paymentErrorMessage(status: number, body: unknown) {
  const cause = body && typeof body === "object" && "cause" in body
    ? (body as { cause?: Array<{ code?: string }> }).cause?.[0]?.code
    : undefined;
  if (status === 401 || status === 403) return "O pagamento não pôde ser autenticado. Fale com a central GoPet.";
  if (cause === "cc_rejected_bad_filled_card_number") return "Número do cartão inválido. Confira os dados.";
  if (cause === "cc_rejected_bad_filled_date") return "Data de validade inválida. Confira os dados.";
  if (cause === "cc_rejected_bad_filled_security_code") return "Código de segurança inválido. Confira os dados.";
  if (cause === "cc_rejected_insufficient_amount") return "Pagamento recusado por saldo ou limite insuficiente.";
  return "Não foi possível processar o pagamento. Confira os dados e tente novamente.";
}

export function normalizePaymentStatus(status: string, expiration?: string | null) {
  if ((status === "pending" || status === "in_process") && expiration && new Date(expiration).getTime() <= Date.now()) return "expired";
  if (["approved", "pending", "in_process", "rejected", "cancelled", "refunded", "expired"].includes(status)) return status;
  return "cancelled";
}

export function verifyMercadoPagoSignature(input: {
  signature: string;
  requestId: string;
  dataId: string;
  secret: string;
}) {
  const parts = new Map(input.signature.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  const timestamp = parts.get("ts");
  const received = parts.get("v1");
  if (!timestamp || !received || !/^\d+$/.test(timestamp) || !/^[a-f0-9]+$/i.test(received)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > 10 * 60 * 1000) return false;
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${timestamp};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const a = Buffer.from(received, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
