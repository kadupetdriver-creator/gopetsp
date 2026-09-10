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

async function balanceOf(admin: any, userId: string): Promise<number> {
  const { data: rows, error } = await admin
    .from("credit_transactions")
    .select("kind, amount_cents")
    .eq("user_id", userId)
    .eq("status", "completed");
  if (error) throw new Error(error.message);
  return (rows ?? []).reduce(
    (acc: number, r: { kind: string; amount_cents: number }) =>
      acc + (r.kind === "spend" ? -r.amount_cents : r.amount_cents),
    0,
  );
}

/** Concede um bônus ao motorista, com o motivo registrado no extrato (somente admin). */
export const adminGrantDriverBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        driverUserId: z.string().uuid(),
        amountCents: z.number().int().min(1).max(1000000),
        reason: z.string().trim().min(3).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ balanceCents: number }> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("credit_transactions").insert({
      user_id: data.driverUserId,
      kind: "topup",
      amount_cents: data.amountCents,
      status: "completed",
      payment_method: "bonus",
      description: `Bônus: ${data.reason}`,
      completed_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { balanceCents: await balanceOf(supabaseAdmin, data.driverUserId) };
  });

/**
 * Cobrança por tempo parado: debita o tutor e repassa 80% ao motorista
 * (20% ficam como comissão da plataforma). Somente admin.
 */
export const adminChargeIdleTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        tutorUserId: z.string().uuid(),
        driverUserId: z.string().uuid(),
        amountCents: z.number().int().min(1).max(1000000),
        reason: z.string().trim().min(3).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ tutorBalanceCents: number; driverAmountCents: number }> => {
    await assertAdmin(context as Ctx);
    if (data.tutorUserId === data.driverUserId) throw new Error("Tutor e motorista devem ser contas diferentes.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: driverProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", data.driverUserId)
      .maybeSingle();
    if (driverProfile?.role !== "driver") throw new Error("A conta selecionada não é de um motorista.");

    const tutorBalance = await balanceOf(supabaseAdmin, data.tutorUserId);
    if (tutorBalance < data.amountCents) throw new Error("Saldo do tutor insuficiente para esta cobrança.");

    const driverAmountCents = Math.round(data.amountCents * 0.8);
    const now = new Date().toISOString();

    const { error: spendErr } = await supabaseAdmin.from("credit_transactions").insert({
      user_id: data.tutorUserId,
      kind: "spend",
      amount_cents: data.amountCents,
      status: "completed",
      payment_method: "manual",
      description: `Tempo parado: ${data.reason}`,
      completed_at: now,
    });
    if (spendErr) throw new Error(spendErr.message);

    const { error: creditErr } = await supabaseAdmin.from("credit_transactions").insert({
      user_id: data.driverUserId,
      kind: "topup",
      amount_cents: driverAmountCents,
      status: "completed",
      payment_method: "manual",
      description: `Repasse por tempo parado: ${data.reason}`,
      completed_at: now,
    });
    if (creditErr) throw new Error(creditErr.message);

    return {
      tutorBalanceCents: await balanceOf(supabaseAdmin, data.tutorUserId),
      driverAmountCents,
    };
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
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (targetUser.user?.email?.toLowerCase() === "kadupetdriver@gmail.com") {
      throw new Error("Este administrador é protegido e não pode ser removido.");
    }
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

export type AdminReportRide = {
  id: string;
  createdAt: string;
  scheduledAt: string;
  status: string;
  priceCents: number;
  paymentStatus: string | null;
  tutorId: string;
  tutorName: string;
  driverId: string | null;
  driverName: string | null;
};

export type AdminReportEntry = {
  id: string;
  createdAt: string;
  personName: string;
  personRole: string;
  kind: "bonus" | "credito" | "desconto";
  amountCents: number;
  description: string | null;
};

export type AdminReport = {
  rides: AdminReportRide[];
  entries: AdminReportEntry[];
};

/** Relatório consolidado de corridas, bônus e descontos (somente admin). */
export const adminGetReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminReport> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: rides, error: ridesErr }, { data: txs, error: txErr }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("rides")
        .select("id, created_at, scheduled_at, status, price_cents, tutor_id, driver_id, ride_payments(status)")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("credit_transactions")
        .select("id, created_at, user_id, kind, amount_cents, description, payment_method, status")
        .in("payment_method", ["manual", "bonus"])
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("profiles").select("id, full_name, role"),
    ]);
    if (ridesErr) throw new Error(ridesErr.message);
    if (txErr) throw new Error(txErr.message);

    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const nameOf = (id: string | null) => (id ? (byId.get(id)?.full_name || "Sem nome") : null);

    return {
      rides: (rides ?? []).map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        scheduledAt: r.scheduled_at,
        status: r.status,
        priceCents: r.price_cents,
        paymentStatus: r.ride_payments?.[0]?.status ?? null,
        tutorId: r.tutor_id,
        tutorName: nameOf(r.tutor_id) ?? "Sem nome",
        driverId: r.driver_id,
        driverName: nameOf(r.driver_id),
      })),
      entries: (txs ?? []).map((t: any) => ({
        id: t.id,
        createdAt: t.created_at,
        personName: nameOf(t.user_id) ?? "Sem nome",
        personRole: byId.get(t.user_id)?.role === "driver" ? "Motorista" : "Tutor",
        kind: t.payment_method === "bonus" ? "bonus" : t.kind === "spend" ? "desconto" : "credito",
        amountCents: t.amount_cents,
        description: t.description,
      })),
    };
  });
