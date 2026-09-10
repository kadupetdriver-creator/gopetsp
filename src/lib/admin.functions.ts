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

export type AdminUser = {
  userId: string;
  email: string;
  fullName: string | null;
  createdAt: string;
};

/** Lista os administradores da plataforma (somente admin). */
export const adminListAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ admins: AdminUser[] }> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return { admins: [] };
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
    const admins: AdminUser[] = [];
    for (const r of roles ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      admins.push({
        userId: r.user_id,
        email: u?.user?.email ?? "—",
        fullName: names.get(r.user_id) ?? null,
        createdAt: r.created_at as string,
      });
    }
    return { admins };
  });

/** Promove um usuário existente a administrador pelo e-mail (somente admin). */
export const adminAddAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().trim().email().max(200) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const found = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) userId = found.id;
      if (list.users.length < 200) break;
    }
    if (!userId) throw new Error("Nenhuma conta encontrada com este e-mail.");

    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

/** Remove o acesso de administrador de um usuário (somente admin). */
export const adminRemoveAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context as Ctx);
    if (data.userId === context.userId) {
      throw new Error("Você não pode remover o próprio acesso de administrador.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) throw new Error("É preciso manter ao menos um administrador.");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
