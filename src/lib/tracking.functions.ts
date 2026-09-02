import { createServerFn } from "@tanstack/react-start";

/**
 * Acompanhamento público por token: devolve só o mínimo necessário
 * (status, bairros, posição do motorista). Nenhum dado pessoal é exposto.
 */
export const getSharedRide = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => {
    const token = String(input?.token ?? "").trim();
    if (!/^[a-f0-9]{32}$/.test(token)) throw new Error("Token inválido");
    return { token };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ride, error } = await supabaseAdmin
      .from("rides")
      .select(
        "status, pet_name, origin_neighborhood, destination_neighborhood, distance_km, scheduled_at, driver_lat, driver_lng, location_updated_at, origin_lat, origin_lng, destination_lat, destination_lng",
      )
      .eq("share_token", data.token)
      .maybeSingle();

    if (error) return { ride: null as null, error: "Não foi possível carregar a corrida." };
    if (!ride) return { ride: null as null, error: "Link inválido ou expirado." };
    return { ride, error: null as null };
  });
