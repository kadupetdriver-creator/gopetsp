import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, LockKeyhole, PawPrint } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatRatingAverage } from "@/lib/review-stats";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  rideId: string;
  reviewerId: string;
  revieweeId: string | null;
  revieweeName: string;
};

const ratingLabels: Record<number, string> = {
  1: "Muito ruim",
  2: "Ruim",
  3: "Regular",
  4: "Muito bom",
  5: "Excelente",
};

export function PawRating({
  value,
  onChange,
  size = "size-7",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayedValue = hovered ?? value;

  return (
    <div
      className="flex items-center gap-1"
      role={onChange ? "radiogroup" : undefined}
      aria-label={onChange ? "Nota em patinhas" : `${value} de 5 patinhas`}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <Button
            key={n}
            type="button"
            variant="ghost"
            size="icon"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} ${n === 1 ? "patinha" : "patinhas"}: ${ratingLabels[n]}`}
            onMouseEnter={() => setHovered(n)}
            onFocus={() => setHovered(n)}
            onBlur={() => setHovered(null)}
            onClick={() => onChange(n)}
            className="size-11 rounded-full p-0 hover:bg-primary/15 [&_svg]:size-8"
          >
            <PawPrint
              className={`${size} transition-all ${
                n <= displayedValue
                  ? "fill-primary text-primary-ink"
                  : "fill-transparent text-muted-foreground/45"
              }`}
              aria-hidden="true"
            />
          </Button>
        ) : (
          <PawPrint
            key={n}
            className={`${size} ${
              n <= Math.round(value)
                ? "fill-primary text-primary-ink"
                : "fill-transparent text-muted-foreground/35"
            }`}
            aria-hidden="true"
          />
        ),
      )}
    </div>
  );
}

export function RideReview({ rideId, reviewerId, revieweeId, revieweeName }: Props) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const { data: reviews } = useQuery({
    queryKey: ["ride-reviews", rideId],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_reviews")
        .select("id, reviewer_id, reviewee_id, rating, comment, created_at")
        .eq("ride_id", rideId)
        .eq("reviewer_id", reviewerId);
      if (error) throw error;
      return data;
    },
  });

  const mine = reviews?.find((r) => r.reviewer_id === reviewerId);
  const { data: summary } = useQuery({
    queryKey: ["rating-summary", reviewerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_rating_summary");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!revieweeId) throw new Error("sem contraparte");
      const { error } = await supabase.from("ride_reviews").insert({
        ride_id: rideId,
        reviewer_id: reviewerId,
        reviewee_id: revieweeId,
        rating,
        comment: comment.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Avaliação enviada com segurança.");
      setComment("");
      void qc.invalidateQueries({ queryKey: ["ride-reviews", rideId] });
      void qc.invalidateQueries({ queryKey: ["reviews"] });
      void qc.invalidateQueries({ queryKey: ["pending-ride-reviews"] });
      void qc.invalidateQueries({ queryKey: ["rating-summary"] });
    },
    onError: () => toast.error("Não foi possível enviar a avaliação."),
  });

  return (
    <section className="space-y-5" aria-labelledby={`review-title-${rideId}`}>
      <div>
        <h2 id={`review-title-${rideId}`} className="text-lg font-semibold">
          Avaliação da corrida
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mine
            ? "Sua avaliação foi enviada e permanece confidencial."
            : `Como foi sua experiência com ${revieweeName}?`}
        </p>
      </div>

      {mine ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="size-4 text-success" /> Sua avaliação
          </p>
          <div className="mt-2">
            <PawRating value={mine.rating} size="size-5" />
          </div>
          {mine.comment && <p className="mt-2 text-sm text-muted-foreground">“{mine.comment}”</p>}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <div>
            <PawRating value={rating} onChange={setRating} />
            <p className="mt-1 text-sm font-medium" aria-live="polite">
              {ratingLabels[rating]}
            </p>
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Conte como foi o cuidado, a pontualidade e a comunicação (opcional)."
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submit.isPending || !revieweeId}>
              {submit.isPending && <Loader2 className="size-4 animate-spin" />}
              Enviar avaliação
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5" /> Sua nota e comentário são confidenciais.
            </p>
          </div>
        </form>
      )}

      {summary && (
        <div className="border-t border-border pt-4">
          <p className="text-sm font-semibold">Sua média de avaliações</p>
          <p className="mt-1 text-sm text-primary-ink">{summary.rating_count > 0 ? `${formatRatingAverage(summary.average_rating, summary.rating_count)} / 5 · ${summary.rating_count} avaliações` : "Sem avaliações"}</p>
        </div>
      )}
    </section>
  );
}
