import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Result = { ok: true } | { error: string };

/** Exclui definitivamente a conta do usuário autenticado e seus dados. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result> => {
    const { supabase, userId } = context;

    // Bloqueia exclusão com dinheiro em aberto.
    const { data: openPayments } = await supabase
      .from("ride_payments")
      .select("id")
      .in("status", ["pending", "held"])
      .limit(1);
    if (openPayments && openPayments.length > 0) {
      return {
        error:
          "Existe uma corrida com pagamento em aberto. Conclua ou cancele antes de excluir a conta.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) return { error: "Não foi possível excluir a conta. Tente novamente." };
    return { ok: true };
  });
