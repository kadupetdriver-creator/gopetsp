import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

/** Normaliza para E.164 brasileiro. Aceita (11) 90000-0000, +5511900000000 etc. */
export function toE164BR(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let national = digits;
  if (national.startsWith("55") && national.length > 11) national = national.slice(2);
  if (national.length < 10 || national.length > 11) return null;
  return `+55${national}`;
}

async function hashCode(code: string, salt: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${code}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function smsConfigured() {
  return Boolean(
    process.env["LOVABLE_API_KEY"] &&
      process.env["TWILIO_API_KEY"] &&
      process.env["TWILIO_FROM_NUMBER"],
  );
}

async function sendSms(to: string, body: string) {
  const response = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TWILIO_API_KEY"]!,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: process.env["TWILIO_FROM_NUMBER"]!, Body: body }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`Twilio SMS falhou [${response.status}]: ${text}`);
    throw new Error(`Não foi possível enviar o SMS [${response.status}]`);
  }
}

export type RequestCodeResult = {
  status: "sent" | "sms_not_configured";
  phone: string;
  expiresInMinutes: number;
};

/** Gera e envia um código de 6 dígitos para o telefone informado pelo usuário logado. */
export const requestPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string }) => {
    const phone = toE164BR(input?.phone ?? "");
    if (!phone) throw new Error("Informe um celular válido com DDD.");
    return { phone };
  })
  .handler(async ({ data, context }): Promise<RequestCodeResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count } = await supabaseAdmin
      .from("phone_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
      throw new Error("Muitas tentativas. Aguarde uma hora antes de pedir um novo código.");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(code, userId);

    await supabaseAdmin
      .from("phone_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("consumed_at", null);

    const { error } = await supabaseAdmin.from("phone_verifications").insert({
      user_id: userId,
      phone: data.phone,
      code_hash,
      expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
    });
    if (error) throw new Error("Não foi possível gerar o código de verificação.");

    await supabaseAdmin
      .from("profiles")
      .update({ phone: data.phone, phone_verified: false, phone_verified_at: null })
      .eq("id", userId);

    if (!smsConfigured()) {
      return { status: "sms_not_configured", phone: data.phone, expiresInMinutes: CODE_TTL_MINUTES };
    }

    await sendSms(data.phone, `PetMobi: seu código de verificação é ${code}. Válido por ${CODE_TTL_MINUTES} minutos.`);
    return { status: "sent", phone: data.phone, expiresInMinutes: CODE_TTL_MINUTES };
  });

/** Confere o código enviado e marca o telefone como verificado. */
export const confirmPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    const code = String(input?.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("O código tem 6 dígitos.");
    return { code };
  })
  .handler(async ({ data, context }): Promise<{ verified: true; phone: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: row } = await supabaseAdmin
      .from("phone_verifications")
      .select("id, phone, code_hash, expires_at, attempts")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) throw new Error("Nenhum código pendente. Solicite um novo.");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("Código expirado. Solicite um novo.");
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new Error("Muitas tentativas incorretas. Solicite um novo código.");
    }

    const hash = await hashCode(data.code, userId);
    if (hash !== row.code_hash) {
      await supabaseAdmin
        .from("phone_verifications")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("Código incorreto.");
    }

    const now = new Date().toISOString();
    await supabaseAdmin.from("phone_verifications").update({ consumed_at: now }).eq("id", row.id);
    await supabaseAdmin
      .from("profiles")
      .update({ phone: row.phone, phone_verified: true, phone_verified_at: now })
      .eq("id", userId);

    return { verified: true, phone: row.phone };
  });
