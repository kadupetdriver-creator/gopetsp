import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatRatingAverage } from "@/lib/review-stats";
import { getRideDriverDetails } from "@/lib/rides.functions";
import { nextPendingReview, validPawRating } from "@/lib/review-flow";
import { PawRating } from "@/components/RideReview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function PendingRideReviews() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [deferred, setDeferred] = useState<string[]>([]);
  const { data: pending = [] } = useQuery({
    queryKey: ["pending-ride-reviews", user?.id],
    enabled: !!user,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pending_ride_reviews");
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => { setDeferred([]); }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const refresh = () => { void qc.invalidateQueries({ queryKey: ["pending-ride-reviews"] }); void qc.invalidateQueries({ queryKey: ["rating-summary"] }); };
    const channel = supabase.channel(`pending-reviews-${user.id}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `tutor_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `driver_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ride_reviews", filter: `reviewer_id=eq.${user.id}` }, refresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    const summaryChannel = supabase.channel(`review-summary:${user.id}`, { config: { private: true } })
      .on("broadcast", { event: "rating_updated" }, refresh)
      .subscribe();
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { void supabase.removeChannel(channel); void supabase.removeChannel(summaryChannel); document.removeEventListener("visibilitychange", visible); };
  }, [user, qc]);
  const next = nextPendingReview(pending, deferred);
  if (!user || !next) return null;
  return <ReviewDialog key={`${user.id}-${next.ride_id}`} pending={next} reviewerId={user.id} onLater={() => setDeferred((ids) => [...ids, next.ride_id])} />;
}

type Pending = { ride_id: string; reviewee_id: string; reviewer_role: string; reviewee_name: string; average_rating: number; rating_count: number };

function ReviewDialog({ pending, reviewerId, onLater }: { pending: Pending; reviewerId: string; onLater: () => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const isTutor = pending.reviewer_role === "tutor";
  const { data: driver } = useQuery({ queryKey: ["ride-driver-identity", pending.ride_id], enabled: isTutor, queryFn: () => getRideDriverDetails({ data: { rideId: pending.ride_id } }) });
  const submit = useMutation({
    mutationFn: async () => {
      if (!validPawRating(rating)) throw new Error("Escolha de 1 a 5 patinhas.");
      const { error } = await supabase.from("ride_reviews").insert({ ride_id: pending.ride_id, reviewer_id: reviewerId, reviewee_id: pending.reviewee_id, rating, comment: comment.trim() || null });
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => {
      toast.success("Avaliação registrada. Obrigado!");
      onLater();
      void qc.invalidateQueries({ queryKey: ["pending-ride-reviews"] });
      void qc.invalidateQueries({ queryKey: ["ride-reviews", pending.ride_id] });
      void qc.invalidateQueries({ queryKey: ["rating-summary"] });
    },
    onError: () => toast.error("Não foi possível enviar. Tente novamente."),
  });
  return <Dialog open onOpenChange={(open) => { if (!open && !submit.isPending) onLater(); }}>
    <DialogContent className="dark w-[calc(100%-2rem)] max-w-md rounded-lg border-primary/35 bg-splash-canvas text-foreground" onEscapeKeyDown={(e) => { if (submit.isPending) e.preventDefault(); }} onPointerDownOutside={(e) => e.preventDefault()}>
      <div className="flex flex-col items-center gap-3 pt-3">
        {driver?.avatarUrl ? <img src={driver.avatarUrl} alt={`Foto de ${pending.reviewee_name}`} className="size-20 rounded-full object-cover" /> : <span className="flex size-20 items-center justify-center rounded-full bg-primary/15 text-primary"><UserRound className="size-9" /></span>}
        <p className="text-center font-semibold">{pending.reviewee_name}</p>
        <p className="text-sm text-primary">{pending.rating_count > 0 ? `${formatRatingAverage(pending.average_rating, pending.rating_count)} / 5 · ${pending.rating_count} avaliações` : "Sem avaliações"}</p>
      </div>
      <DialogTitle className="text-center text-xl leading-snug">{isTutor ? "Como foi o transporte do seu pet?" : "Como foi sua experiência com este tutor?"}</DialogTitle>
      <DialogDescription className="sr-only">Avaliação da corrida concluída, de 1 a 5 patinhas.</DialogDescription>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!submit.isPending) submit.mutate(); }}>
        <div className="flex justify-center"><PawRating value={rating} onChange={setRating} /></div>
        <Textarea aria-label="Comentário opcional" placeholder="Comentário (opcional)" maxLength={500} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} disabled={submit.isPending} />
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-4 shrink-0" /> Sua nota e comentário são confidenciais.</p>
        <Button className="w-full" type="submit" disabled={!validPawRating(rating) || submit.isPending}>{submit.isPending && <Loader2 className="size-4 animate-spin" />}Enviar avaliação</Button>
        <Button className="w-full" variant="ghost" type="button" onClick={onLater} disabled={submit.isPending}>Avaliar depois</Button>
      </form>
    </DialogContent>
  </Dialog>;
}