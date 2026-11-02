import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canCreateDriverQuote, calculateDriverQuote, driverQuoteSchema, type DriverQuoteInput } from "./driver-quote";

export const quoteDriverRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DriverQuoteInput) => driverQuoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase.from("profiles")
      .select("role, is_active").eq("id", context.userId).maybeSingle();
    if (error || !canCreateDriverQuote(profile)) throw new Error("Orçamento disponível apenas para motoristas com conta ativa.");
    const { drivingDistance } = await import("./routing.server");
    const route = await drivingDistance([data.origin.lat, data.origin.lng], [data.destination.lat, data.destination.lng], data.stops.map((stop) => [stop.lat, stop.lng]));
    return calculateDriverQuote(data, route.distanceKm, route.durationMinutes);
  });