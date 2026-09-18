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
 * Cobrança por tempo parado: debita o tutor e repassa 75% ao motorista
 * (25% ficam como comissão da plataforma). Somente admin.
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

    const driverAmountCents = Math.round(data.amountCents * 0.75);
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

export type AdminReportFilters = {
  startDate?: string | null;
  endDate?: string | null;
};

export type AdminReport = {
  rides: AdminReportRide[];
  entries: AdminReportEntry[];
};

function startOfDayIso(dateIso: string) {
  const d = new Date(dateIso);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayIso(dateIso: string) {
  const d = new Date(dateIso);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Relatório consolidado de corridas, bônus e descontos (somente admin). */
export const adminGetReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        startDate: z.string().datetime({ offset: true }).nullable().optional(),
        endDate: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .passthrough()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminReport> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let ridesQuery = supabaseAdmin
      .from("rides")
      .select("id, created_at, scheduled_at, status, price_cents, tutor_id, driver_id, ride_payments(status)")
      .order("created_at", { ascending: false })
      .limit(500);

    let txsQuery = supabaseAdmin
      .from("credit_transactions")
      .select("id, created_at, user_id, kind, amount_cents, description, payment_method, status")
      .in("payment_method", ["manual", "bonus"])
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.startDate) {
      const from = startOfDayIso(data.startDate);
      ridesQuery = ridesQuery.gte("created_at", from);
      txsQuery = txsQuery.gte("created_at", from);
    }
    if (data.endDate) {
      const to = endOfDayIso(data.endDate);
      ridesQuery = ridesQuery.lte("created_at", to);
      txsQuery = txsQuery.lte("created_at", to);
    }

    const [{ data: rides, error: ridesErr }, { data: txs, error: txErr }, { data: profiles }] = await Promise.all([
      ridesQuery,
      txsQuery,
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

/* ==========================================================================
 * Relatórios de ganhos (pagamento manual feito pelos administradores)
 * Ganhos Seg-Qui (gerado às sextas): corridas de segunda a quinta da semana.
 * Ganhos Sex-Dom (gerado às segundas): corridas de sexta, sábado e domingo anteriores.
 * ======================================================================= */

const SP_OFFSET_HOURS = 3; // São Paulo = UTC-3

export type PayoutKind = "repasse1" | "repasse2";

export type PayoutRideRow = {
  id: string;
  scheduledAt: string;
  tutorName: string;
  priceCents: number;
  driverAmountCents: number;
};

export type PayoutAdjustment = {
  id: string;
  createdAt: string;
  kind: "bonus" | "desconto";
  amountCents: number;
  description: string | null;
};

export type PayoutDriverGroup = {
  driverId: string;
  driverName: string;
  rides: PayoutRideRow[];
  ridesTotalCents: number;
  adjustments: PayoutAdjustment[];
  adjustmentsCents: number;
  totalCents: number;
};

export type PayoutReport = {
  kind: PayoutKind;
  startIso: string;
  endIso: string;
  drivers: PayoutDriverGroup[];
  totalRides: number;
  totalCents: number;
};

/** Converte uma data local de São Paulo (ano/mês/dia + hora) para ISO em UTC. */
function spIso(y: number, m: number, d: number, h: number, mi: number, s: number, ms: number) {
  return new Date(Date.UTC(y, m, d, h + SP_OFFSET_HOURS, mi, s, ms)).toISOString();
}

export function payoutWindow(kind: PayoutKind, reference: Date) {
  // "local" carrega os campos UTC já deslocados para o fuso de São Paulo.
  const local = new Date(reference.getTime() - SP_OFFSET_HOURS * 3600_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const dow = local.getUTCDay(); // 0 domingo ... 6 sábado

  if (kind === "repasse1") {
    // Segunda a quinta da semana da data de referência.
    const monday = d - ((dow + 6) % 7);
    return {
      startIso: spIso(y, m, monday, 0, 0, 0, 0),
      endIso: spIso(y, m, monday + 3, 23, 59, 59, 999),
    };
  }
  // Sexta, sábado e domingo imediatamente anteriores à data de referência.
  const lastSunday = d - (dow === 0 ? 7 : dow);
  return {
    startIso: spIso(y, m, lastSunday - 2, 0, 0, 0, 0),
    endIso: spIso(y, m, lastSunday, 23, 59, 59, 999),
  };
}

/** Relatório de ganhos por motorista em um período fechado (somente admin). */
export const adminGetPayoutReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(["repasse1", "repasse2"]),
        referenceDate: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PayoutReport> => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const reference = data.referenceDate ? new Date(data.referenceDate) : new Date();
    const { startIso, endIso } = payoutWindow(data.kind, reference);

    const [{ data: rides, error: ridesErr }, { data: txs }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("rides")
        .select("id, scheduled_at, price_cents, tutor_id, driver_id, ride_payments(driver_amount_cents)")
        .eq("status", "completed")
        .not("driver_id", "is", null)
        .gte("scheduled_at", startIso)
        .lte("scheduled_at", endIso)
        .order("scheduled_at", { ascending: true })
        .limit(1000),
      supabaseAdmin
        .from("credit_transactions")
        .select("id, created_at, user_id, kind, amount_cents, description, payment_method")
        .in("payment_method", ["manual", "bonus"])
        .eq("status", "completed")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .limit(1000),
      supabaseAdmin.from("profiles").select("id, full_name, role"),
    ]);
    if (ridesErr) throw new Error(ridesErr.message);

    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const nameOf = (id: string | null) => (id ? byId.get(id)?.full_name || "Sem nome" : "Sem nome");

    const groups = new Map<string, PayoutDriverGroup>();
    const groupFor = (driverId: string) => {
      let g = groups.get(driverId);
      if (!g) {
        g = {
          driverId,
          driverName: nameOf(driverId),
          rides: [],
          ridesTotalCents: 0,
          adjustments: [],
          adjustmentsCents: 0,
          totalCents: 0,
        };
        groups.set(driverId, g);
      }
      return g;
    };

    for (const r of (rides ?? []) as any[]) {
      const driverAmount =
        r.ride_payments?.[0]?.driver_amount_cents ?? Math.round(r.price_cents * 0.75);
      const g = groupFor(r.driver_id);
      g.rides.push({
        id: r.id,
        scheduledAt: r.scheduled_at,
        tutorName: nameOf(r.tutor_id),
        priceCents: r.price_cents,
        driverAmountCents: driverAmount,
      });
      g.ridesTotalCents += driverAmount;
    }

    // Bônus e descontos lançados para motoristas dentro do mesmo período.
    for (const t of (txs ?? []) as any[]) {
      if (byId.get(t.user_id)?.role !== "driver") continue;
      if (!groups.has(t.user_id) && t.kind === "spend") continue;
      const g = groupFor(t.user_id);
      const isDesconto = t.kind === "spend";
      g.adjustments.push({
        id: t.id,
        createdAt: t.created_at,
        kind: isDesconto ? "desconto" : "bonus",
        amountCents: t.amount_cents,
        description: t.description,
      });
      g.adjustmentsCents += isDesconto ? -t.amount_cents : t.amount_cents;
    }

    const drivers = [...groups.values()]
      .map((g) => ({ ...g, totalCents: g.ridesTotalCents + g.adjustmentsCents }))
      .sort((a, b) => a.driverName.localeCompare(b.driverName, "pt-BR"));

    return {
      kind: data.kind,
      startIso,
      endIso,
      drivers,
      totalRides: drivers.reduce((acc, g) => acc + g.rides.length, 0),
      totalCents: drivers.reduce((acc, g) => acc + g.totalCents, 0),
    };
  });
