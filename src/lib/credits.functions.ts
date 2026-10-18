import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const MIN_TOPUP_CENTS = 2000;
export const MAX_TOPUP_CENTS = 500000;

/** Saldo disponível (em centavos) do usuário autenticado. */
export const getCreditBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ balanceCents: number }> => {
    const { data, error } = await context.supabase.rpc("my_credit_balance_cents");
    if (error) throw new Error("Não foi possível consultar o saldo GoPet.");
    return { balanceCents: typeof data === "number" ? data : 0 };
  });

/** Paga a corrida usando o saldo GoPet do tutor. */
export const payRideWithCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rideId: string; couponId?: string | null }) =>
    z.object({ rideId: z.string().uuid(), couponId: z.string().uuid().nullish() }).parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ status: string } | { error: string; balanceCents?: number }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: result, error } = await supabaseAdmin.rpc("pay_ride_with_gopet_balance", {
        _ride_id: data.rideId,
        _user_id: context.userId,
        _coupon_id: data.couponId ?? undefined,
      });
      if (error) {
        console.error("[gopet-balance-payment]", { rideId: data.rideId, code: error.code });
        return { error: "Não foi possível pagar com saldo. Tente novamente." };
      }
      return z.union([
        z.object({ status: z.string(), balanceCents: z.number().optional() }),
        z.object({ error: z.string(), balanceCents: z.number().optional() }),
      ]).parse(result);
    },
  );
