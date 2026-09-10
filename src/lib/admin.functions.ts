import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Apenas administradores podem executar esta ação.");
}

/** Altera o e-mail de login de um usuário (somente admin). */
export const adminUpdateUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), email: z.string().email().max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("drivers").update({ email: data.email }).eq("user_id", data.userId);
    return { ok: true };
  });

/** Ativa/desativa uma conta: marca o perfil e bloqueia (ou libera) o login (somente admin). */
export const adminSetAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    if (data.userId === context.userId && !data.active) {
      throw new Error("Você não pode desativar a própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.active })
      .eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);
    return { ok: true };
  });

/** Saldo de créditos de um usuário (somente admin). */
export const adminGetCreditBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ balanceCents: number }> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("credit_transactions")
      .select("kind, amount_cents")
      .eq("user_id", data.userId)
      .eq("status", "completed");
    if (error) throw new Error(error.message);
    const balanceCents = (rows ?? []).reduce(
      (acc, r) => acc + (r.kind === "spend" ? -r.amount_cents : r.amount_cents),
      0,
    );
    return { balanceCents };
  });

/** Lança saldo manual (crédito ou débito) na conta de um tutor (somente admin). */
export const adminAdjustCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        amountCents: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 1000000, {
          message: "Valor inválido (máximo R$ 10.000,00 por lançamento).",
        }),
        note: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ balanceCents: number }> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const credit = data.amountCents > 0;
    const { error } = await supabaseAdmin.from("credit_transactions").insert({
      user_id: data.userId,
      kind: credit ? "topup" : "spend",
      amount_cents: Math.abs(data.amountCents),
      status: "completed",
      payment_method: "manual",
      description: data.note?.trim()
        ? data.note.trim()
        : credit
          ? "Saldo inserido pela administração"
          : "Ajuste de saldo pela administração",
      completed_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    const { data: rows } = await supabaseAdmin
      .from("credit_transactions")
      .select("kind, amount_cents")
      .eq("user_id", data.userId)
      .eq("status", "completed");
    const balanceCents = (rows ?? []).reduce(
      (acc, r) => acc + (r.kind === "spend" ? -r.amount_cents : r.amount_cents),
      0,
    );
    return { balanceCents };
  });
