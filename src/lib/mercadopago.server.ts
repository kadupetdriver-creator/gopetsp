import { createHmac, timingSafeEqual } from "node:crypto";

const MP_API = "https://api.mercadopago.com";

export type MercadoPagoOrderPayment = {
  id?: string | number;
  status: string;
  status_detail?: string | null;
  amount?: string | number;
  payment_method?: { id?: string | null; type?: string | null } | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
};

export type MercadoPagoOrder = {
  id: string;
  status: string;
  status_detail?: string | null;
  external_reference?: string | null;
  total_amount?: string | number;
  expiration_time?: string | null;
  transactions?: { payments?: MercadoPagoOrderPayment[] } | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string };
  } | null;
  payment_method?: { id?: string | null; type?: string | null } | null;
  qr_code?: string | null;
  qr_code_base64?: string | null;
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

export function normalizeOrderStatus(status: string, expiration?: string | null) {
  const normalized = status.toLowerCase();
  if (["created", "pending", "action_required"].includes(normalized) && expiration && new Date(expiration).getTime() <= Date.now()) return "expired";
  if (["processed", "approved"].includes(normalized)) return "approved";
  if (["created", "pending"].includes(normalized)) return "pending";
  if (["processing", "in_process", "action_required"].includes(normalized)) return "in_process";
  if (["failed", "rejected"].includes(normalized)) return "rejected";
  if (["canceled", "cancelled"].includes(normalized)) return "cancelled";
  if (["refunded", "partially_refunded", "charged_back"].includes(normalized)) return "refunded";
  if (normalized === "expired") return "expired";
  return "pending";
}

export function orderPayment(order: MercadoPagoOrder) {
  return order.transactions?.payments?.[0];
}

export function orderAmountCents(order: MercadoPagoOrder) {
  const amount = order.total_amount ?? orderPayment(order)?.amount;
  return Math.round(Number(amount ?? 0) * 100);
}

export function orderPixData(order: MercadoPagoOrder) {
  const source = orderPayment(order) as (MercadoPagoOrderPayment & {
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
    qr_code?: string;
    qr_code_base64?: string;
  }) | undefined;
  return {
    qrCode: order.qr_code ?? order.point_of_interaction?.transaction_data?.qr_code ?? source?.qr_code ?? source?.point_of_interaction?.transaction_data?.qr_code ?? null,
    qrCodeBase64: order.qr_code_base64 ?? order.point_of_interaction?.transaction_data?.qr_code_base64 ?? source?.qr_code_base64 ?? source?.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
  };
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
