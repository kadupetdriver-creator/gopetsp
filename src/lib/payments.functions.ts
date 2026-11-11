import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { CANCELLATION_FEES_ACTIVE, driverShareOfFee } from "./cancellation-policy";
import { centsToMpAmount, partialRefundSupport, refundAmountCents } from "./cancellation-refund";

type ActionResult = { status: string; refundedCents?: number } | { error: string };

function isUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

type MpOrderLite = { id: string; status: string; status_detail?: string | null; transactions?: { payments?: { id?: string | number; amount?: string | number; payment_method?: { type?: string | null } | null; payment_type_id?: string | null }[] } | null };

/**
 * Estorno de corrida cancelada. Com CANCELLATION_FEES_ACTIVE = false o comportamento é
 * o original (estorno integral). Quando ativado, devolve o valor da política de
 * cancelamento (parcial) com chave de idempotência por cancelamento.
 */
export const refundRidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rideId: string }) => {
    if (!isUuid(data.rideId)) throw new Error("Corrida inválida");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const { supabase, userId } = context;
    const { data: ride } = await supabase
      .from("rides")
      .select("id, tutor_id, driver_id, status, price_cents, paid_at, driver_fixed_cents")
      .eq("id", data.rideId)
      .maybeSingle();
    if (!ride) return { error: "Corrida não encontrada" };
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (ride.tutor_id !== userId && !isAdmin) return { error: "Sem permissão" };
    if (ride.status !== "cancelled") return { error: "A corrida não está cancelada" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cancellation } = await supabaseAdmin.from("ride_cancellations").select("*").eq("ride_id", ride.id).maybeSingle();
    const partialMode = CANCELLATION_FEES_ACTIVE && !!cancellation;
    if (!ride.paid_at) return { status: "none" };

    const record = async (fields: Database["public"]["Tables"]["ride_cancellations"]["Update"]) => {
      if (cancellation) await supabaseAdmin.from("ride_cancellations").update(fields).eq("id", cancellation.id);
    };

    if (partialMode) {
      if (["refunded", "retained", "processing"].includes(cancellation.refund_status)) {
        return { status: "refunded", refundedCents: cancellation.refunded_amount_cents ?? 0 };
      }
      // Trava contra execução concorrente/duplicada.
      const { data: locked } = await supabaseAdmin.from("ride_cancellations").update({ refund_status: "processing", refund_error: null })
        .eq("id", cancellation.id).in("refund_status", ["not_requested", "failed"]).select("id").maybeSingle();
      if (!locked) return { status: "refunded", refundedCents: cancellation.refunded_amount_cents ?? 0 };
    }

    const finish = async (method: string, paidCents: number, refunded: number, extra: Database["public"]["Tables"]["ride_cancellations"]["Update"] = {}) => {
      const retained = paidCents - refunded;
      await record({
        refund_status: refunded > 0 ? "refunded" : "retained", refund_method: method,
        refunded_amount_cents: refunded, retained_amount_cents: retained, refunded_at: new Date().toISOString(),
        ...(partialMode ? { driver_share_cents: driverShareOfFee(retained, paidCents, ride.driver_fixed_cents ? Math.round(ride.driver_fixed_cents * paidCents / Math.max(ride.price_cents, 1)) : null) } : {}),
        ...extra,
      });
      console.info("[ride-refund]", { rideId: ride.id, method, paidCents, refunded, retained, partialMode, at: new Date().toISOString() });
      return { status: refunded > 0 ? "refunded" : "retained", refundedCents: refunded };
    };
    const fail = async (message: string) => {
      await record({ refund_status: "failed", refund_error: message });
      return { error: message };
    };

    // Saldo GoPet
    const { data: debit } = await supabaseAdmin.from("credit_transactions").select("amount_cents")
      .eq("ride_id", ride.id).eq("kind", "spend").eq("payment_method", "credits").eq("status", "completed").maybeSingle();
    if (debit) {
      const amount = refundAmountCents(debit.amount_cents, cancellation, CANCELLATION_FEES_ACTIVE);
      const { error } = partialMode
        ? await supabaseAdmin.rpc("refund_ride_gopet_balance_amount", { _ride_id: ride.id, _amount_cents: amount })
        : await supabaseAdmin.rpc("refund_ride_gopet_balance", { _ride_id: ride.id });
      if (error) return fail("Não foi possível devolver o saldo. Tente novamente.");
      return finish("gopet_balance", debit.amount_cents, partialMode ? amount : debit.amount_cents);
    }

    const { data: payment } = await supabaseAdmin
      .from("mercadopago_payments")
      .select("id, mp_order_id, status, amount_cents, refund_idempotency_key")
      .eq("ride_id", ride.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!payment?.mp_order_id) {
      if (partialMode) await record({ refund_status: "not_requested" });
      return { status: "none" };
    }
    const amount = refundAmountCents(payment.amount_cents, cancellation, CANCELLATION_FEES_ACTIVE);

    try {
      const { mercadoPagoRequest } = await import("./mercadopago.server");
      if (amount >= payment.amount_cents) {
        await mercadoPagoRequest(`/v1/orders/${encodeURIComponent(payment.mp_order_id)}/refund`, {
          method: "POST",
          idempotencyKey: payment.refund_idempotency_key,
        });
        await supabaseAdmin.from("mercadopago_payments").update({ status: "refunded" }).eq("id", payment.id);
        await supabaseAdmin.from("rides").update({ paid_at: null }).eq("id", ride.id);
        return finish("mercadopago", payment.amount_cents, payment.amount_cents, { refund_mp_order_id: payment.mp_order_id });
      }
      if (amount <= 0) {
        return finish("mercadopago", payment.amount_cents, 0, { refund_mp_order_id: payment.mp_order_id });
      }
      const order = await mercadoPagoRequest<MpOrderLite>(`/v1/orders/${encodeURIComponent(payment.mp_order_id)}`, { method: "GET" });
      const tx = order.transactions?.payments?.[0];
      const check = partialRefundSupport({
        orderStatus: order.status, paymentType: tx?.payment_method?.type ?? tx?.payment_type_id ?? null,
        paidAt: ride.paid_at, alreadyRefunded: /refund/i.test(order.status_detail ?? ""),
      });
      if (!check.allowed || !tx?.id) return fail(check.reason ?? "Transação do pagamento não encontrada.");
      await mercadoPagoRequest(`/v1/orders/${encodeURIComponent(payment.mp_order_id)}/refund`, {
        method: "POST",
        idempotencyKey: cancellation!.refund_idempotency_key,
        body: JSON.stringify({ transactions: [{ id: String(tx.id), amount: centsToMpAmount(amount) }] }),
      });
      await supabaseAdmin.from("mercadopago_payments").update({ status: "refunded", status_detail: "partially_refunded" }).eq("id", payment.id);
      return finish("mercadopago", payment.amount_cents, amount, { refund_mp_order_id: payment.mp_order_id, refund_transaction_id: String(tx.id) });
    } catch (error) {
      console.error("Mercado Pago refund failed", error);
      return fail(error instanceof Error ? error.message : "Não foi possível concluir o reembolso.");
    }
  });

/**
 * Simulação administrativa (somente leitura): consulta o pagamento no Mercado Pago e
 * mostra o estorno que seria feito, sem executar nenhum reembolso.
 */
export const adminSimulateCancellationRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ cancellationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (isAdmin !== true) throw new Error("Apenas administradores.");
    const { data: c } = await context.supabase.from("ride_cancellations").select("*").eq("id", data.cancellationId).maybeSingle();
    if (!c) throw new Error("Cancelamento não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: debit } = await supabaseAdmin.from("credit_transactions").select("amount_cents")
      .eq("ride_id", c.ride_id).eq("kind", "spend").eq("payment_method", "credits").maybeSingle();
    if (debit) {
      const refund = refundAmountCents(debit.amount_cents, c, true);
      return { method: "Saldo GoPet", paidCents: debit.amount_cents, refundCents: refund, retainedCents: debit.amount_cents - refund, partialAllowed: true, note: "Devolução ao saldo GoPet do tutor." };
    }
    const { data: payment } = await supabaseAdmin.from("mercadopago_payments").select("mp_order_id, amount_cents, status")
      .eq("ride_id", c.ride_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!payment?.mp_order_id) return { method: "—", paidCents: 0, refundCents: 0, retainedCents: 0, partialAllowed: false, note: "Nenhum pagamento encontrado para esta corrida." };
    const refund = refundAmountCents(payment.amount_cents, c, true);
    try {
      const { mercadoPagoRequest } = await import("./mercadopago.server");
      const order = await mercadoPagoRequest<MpOrderLite>(`/v1/orders/${encodeURIComponent(payment.mp_order_id)}`, { method: "GET" });
      const tx = order.transactions?.payments?.[0];
      const type = tx?.payment_method?.type ?? tx?.payment_type_id ?? null;
      const check = partialRefundSupport({ orderStatus: order.status, paymentType: type, paidAt: null, alreadyRefunded: /refund/i.test(order.status_detail ?? "") });
      return { method: `Mercado Pago (${type ?? "?"})`, paidCents: payment.amount_cents, refundCents: refund, retainedCents: payment.amount_cents - refund, partialAllowed: check.allowed, note: check.reason ?? `Situação no Mercado Pago: ${order.status}${order.status_detail ? ` / ${order.status_detail}` : ""}` };
    } catch (e) {
      return { method: "Mercado Pago", paidCents: payment.amount_cents, refundCents: refund, retainedCents: payment.amount_cents - refund, partialAllowed: false, note: e instanceof Error ? e.message : "Falha ao consultar o Mercado Pago." };
    }
  });
