import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Compartilha a posição do motorista automaticamente enquanto houver corridas ativas.
 * Não exige nenhuma interação: liga sozinho e desliga quando não há corridas.
 */
export function useDriverAutoGps(rideIds: string[], enabled: boolean) {
  const idsRef = useRef<string[]>(rideIds);
  idsRef.current = rideIds;
  const key = rideIds.join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        // Evita gravações excessivas: no máximo uma a cada 10s.
        if (now - lastSent < 10000) return;
        lastSent = now;
        const payload = {
          driver_lat: pos.coords.latitude,
          driver_lng: pos.coords.longitude,
          location_updated_at: new Date().toISOString(),
        };
        void (async () => {
          for (const id of idsRef.current) {
            await supabase.from("rides").update(payload).eq("id", id);
          }
        })();
      },
      () => {
        /* sem permissão de GPS: segue sem rastreio */
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, key]);
}
