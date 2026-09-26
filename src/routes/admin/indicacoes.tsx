import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/rides";

export const Route = createFileRoute("/admin/indicacoes")({
  head: () => ({
    meta: [
      { title: "Indicações | Admin GoPet" },
      { name: "description", content: "Acompanhe indicações, cupons e bônus do programa de indicação GoPet." },
      { property: "og:title", content: "Indicações | Admin GoPet" },
      { property: "og:description", content: "Painel do programa de indicação GoPet." },
    ],
  }),
  component: AdminReferrals,
});

const couponLabel: Record<string, string> = { available: "Disponível", used: "Usado", revoked: "Revogado" };
const bonusLabel: Record<string, string> = { pending: "A pagar", paid: "Pago", revoked: "Revogado" };

function AdminReferrals() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      const [refs, coupons, bonuses, profiles] = await Promise.all([
        supabase.from("referrals").select("*").order("created_at", { ascending: false }),
        supabase.from("referral_coupons").select("*").order("created_at", { ascending: false }),
        supabase.from("driver_referral_bonuses").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name"),
      ]);
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || "Sem nome"]));
      return { refs: refs.data ?? [], coupons: coupons.data ?? [], bonuses: bonuses.data ?? [], names };
    },
  });
  const name = (id: string) => data?.names.get(id) ?? id.slice(0, 8);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-referrals"] });

  const revokeCoupon = async (id: string) => {
    const reason = window.prompt("Motivo da revogação:");
    if (!reason) return;
    const { error } = await supabase.from("referral_coupons").update({ status: "revoked", revoked_reason: reason }).eq("id", id);
    if (error) return toast.error("Não foi possível revogar.");
    toast.success("Cupom revogado."); void refresh();
  };
  const updateBonus = async (id: string, status: "paid" | "revoked") => {
    let reason: string | null = null;
    if (status === "revoked") { reason = window.prompt("Motivo da revogação:"); if (!reason) return; }
    const { error } = await supabase.from("driver_referral_bonuses")
      .update({ status, revoked_reason: reason, paid_at: status === "paid" ? new Date().toISOString() : null }).eq("id", id);
    if (error) return toast.error("Não foi possível atualizar.");
    toast.success("Bônus atualizado."); void refresh();
  };

  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const used = data.coupons.filter((c) => c.status === "used").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Indicações</p><p className="text-2xl font-semibold">{data.refs.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Cupons gerados / usados</p><p className="text-2xl font-semibold">{data.coupons.length} / {used}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Bônus gerados</p><p className="text-2xl font-semibold">{data.bonuses.length}</p></CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>Quem indicou quem</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {data.refs.length === 0 && <p className="text-muted-foreground">Nenhuma indicação ainda.</p>}
        {data.refs.map((r) => (
          <div key={r.id} className="flex flex-wrap justify-between gap-2 border-b pb-2">
            <span><strong>{name(r.referrer_id)}</strong> → {name(r.referred_id)} <span className="text-muted-foreground">({r.code}, {formatDateTime(r.created_at)})</span></span>
            <span className="flex gap-1">
              {r.tutor_qualified_at && <Badge variant="secondary">1ª corrida tutor</Badge>}
              {r.driver_qualified_at && <Badge variant="secondary">1ª corrida motorista</Badge>}
            </span>
          </div>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Cupons de 20%</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {data.coupons.length === 0 && <p className="text-muted-foreground">Nenhum cupom gerado.</p>}
        {data.coupons.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <span><span className="font-mono">{c.code}</span> — {name(c.owner_id)}{c.revoked_reason && <span className="text-muted-foreground"> ({c.revoked_reason})</span>}</span>
            <span className="flex items-center gap-2"><Badge>{couponLabel[c.status]}</Badge>
              {c.status === "available" && <Button size="sm" variant="outline" onClick={() => revokeCoupon(c.id)}>Revogar</Button>}</span>
          </div>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Bônus de motoristas</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {data.bonuses.length === 0 && <p className="text-muted-foreground">Nenhum bônus gerado.</p>}
        {data.bonuses.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <span>{name(b.driver_id)} — {formatBRL(b.amount_cents)} <span className="text-muted-foreground">({formatDateTime(b.created_at)}){b.revoked_reason && ` — ${b.revoked_reason}`}</span></span>
            <span className="flex items-center gap-2"><Badge>{bonusLabel[b.status]}</Badge>
              {b.status === "pending" && <>
                <Button size="sm" onClick={() => updateBonus(b.id, "paid")}>Marcar como pago</Button>
                <Button size="sm" variant="outline" onClick={() => updateBonus(b.id, "revoked")}>Revogar</Button>
              </>}</span>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
