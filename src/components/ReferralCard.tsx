import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Gift, Share2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/rides";

export function ReferralCard({ userId, mode }: { userId: string; mode: "tutor" | "motorista" }) {
  const qc = useQueryClient();
  const [claim, setClaim] = useState("");
  const { data } = useQuery({
    queryKey: ["referral", userId],
    queryFn: async () => {
      const [code, refs, mine, coupons, bonuses] = await Promise.all([
        supabase.from("referral_codes").select("code").eq("user_id", userId).maybeSingle(),
        supabase.from("referrals").select("tutor_qualified_at, driver_qualified_at").eq("referrer_id", userId),
        supabase.from("referrals").select("id").eq("referred_id", userId).maybeSingle(),
        supabase.from("referral_coupons").select("id, code, status, used_at, discount_percent").eq("owner_id", userId).order("created_at", { ascending: false }),
        supabase.from("driver_referral_bonuses").select("id, amount_cents, status, created_at").eq("driver_id", userId).order("created_at", { ascending: false }),
      ]);
      return {
        code: code.data?.code ?? null,
        refs: refs.data ?? [],
        wasReferred: !!mine.data,
        coupons: coupons.data ?? [],
        bonuses: bonuses.data ?? [],
      };
    },
  });
  if (!data) return null;

  const tutorDone = data.refs.filter((r) => r.tutor_qualified_at).length;
  const driverDone = data.refs.filter((r) => r.driver_qualified_at).length;
  const shareText = `Use meu código ${data.code} ao se cadastrar na GoPet: ${typeof window !== "undefined" ? window.location.origin : ""}/auth`;

  const copy = async () => {
    if (!data.code) return;
    await navigator.clipboard.writeText(data.code);
    toast.success("Código copiado!");
  };
  const applyCode = async () => {
    const { error } = await supabase.rpc("apply_referral_code", { _code: claim });
    if (error) return toast.error(error.message);
    toast.success("Código de indicação aplicado!");
    void qc.invalidateQueries({ queryKey: ["referral", userId] });
  };

  const available = data.coupons.filter((c) => c.status === "available");
  const used = data.coupons.filter((c) => c.status === "used");
  const pendingBonus = data.bonuses.filter((b) => b.status === "pending").reduce((s, b) => s + b.amount_cents, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gift className="size-5 text-primary" /> Indique e ganhe</CardTitle>
        <CardDescription>
          {mode === "tutor"
            ? "A cada 5 indicados que concluírem a 1ª corrida paga, você ganha 1 cupom de 20%."
            : "A cada 5 motoristas indicados que concluírem a 1ª corrida, você ganha R$ 50,00 de bônus."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border bg-muted px-3 py-2 font-mono text-lg font-semibold">{data.code ?? "—"}</span>
          <Button variant="outline" size="sm" onClick={copy}><Copy className="size-4" /> Copiar</Button>
          <Button size="sm" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
              <Share2 className="size-4" /> Compartilhar código
            </a>
          </Button>
        </div>

        {mode === "tutor" ? (
          <>
            <p className="text-sm"><strong>{tutorDone % 5} de 5</strong> corridas indicadas concluídas para o próximo cupom.</p>
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Ticket className="size-4" /> Meus cupons</p>
              {available.length === 0 && used.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cupom ainda.</p>}
              <ul className="space-y-1 text-sm">
                {available.map((c) => <li key={c.id} className="flex justify-between"><span className="font-mono">{c.code}</span><Badge>{c.discount_percent}% disponível</Badge></li>)}
                {used.map((c) => <li key={c.id} className="flex justify-between text-muted-foreground"><span className="font-mono line-through">{c.code}</span><Badge variant="secondary">Usado</Badge></li>)}
              </ul>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm"><strong>{driverDone % 5} de 5</strong> motoristas indicados completaram a 1ª corrida.</p>
            <p className="text-sm">Bônus a receber: <strong>{formatBRL(pendingBonus)}</strong> <span className="text-muted-foreground">(pago pela GoPet via Pix)</span></p>
          </>
        )}

        {!data.wasReferred && (
          <div className="flex gap-2 border-t pt-4">
            <Input placeholder="Tem um código de indicação?" value={claim} onChange={(e) => setClaim(e.target.value.toUpperCase())} />
            <Button variant="outline" onClick={applyCode} disabled={!claim.trim()}>Aplicar</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
