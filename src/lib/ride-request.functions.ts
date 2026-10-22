import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requestRideDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rideId: string }) => {
    if (!input?.rideId || !/^[0-9a-f-]{36}$/i.test(input.rideId)) throw new Error("Corrida inválida.");
    return { rideId: input.rideId };
  })
  .handler(async ({ data, context }) => {
    const { data: ride, error } = await context.supabase.from("rides")
      .select("id, tutor_id").eq("id", data.rideId).eq("tutor_id", context.userId).maybeSingle();
    if (error || !ride) return { error: "Corrida não encontrada." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: requestedAt, error: requestError } = await supabaseAdmin.rpc("request_paid_ride_driver", {
      _ride_id: ride.id, _tutor_id: context.userId,
    });
    if (requestError) return { error: requestError.message };
    return { requestedAt };
  });