import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDriverAutoGps } from "@/hooks/useDriverAutoGps";
import { activeStatuses } from "@/lib/rides";

/**
 * Envia a posição do motorista automaticamente, em qualquer tela do app,
 * enquanto ele tiver corridas em andamento. Não renderiza nada.
 */
export function DriverLocationSync() {
  const { user, profile } = useAuth();
  const isDriver = profile?.role === "driver";

  const { data: rideIds } = useQuery({
    queryKey: ["driver-active-ride-ids", user?.id],
    enabled: !!user && isDriver,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("id")
        .eq("driver_id", user!.id)
        .in("status", activeStatuses);
      if (error) throw error;
      return (data ?? []).map((r) => r.id);
    },
  });

  useDriverAutoGps(rideIds ?? [], !!isDriver);
  return null;
}

export default DriverLocationSync;
