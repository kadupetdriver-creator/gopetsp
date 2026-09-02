import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  rideId: string;
  reviewerId: string;
  revieweeId: string | null;
  revieweeName: string;
};

export function StarRating({
  value,
  onChange,
  size = "size-6",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = (
          <Star
            className={`${size} ${filled ? "fill-warning text-warning" : "text-muted-foreground"}`}
          />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            onClick={() => onChange(n)}
            className="transition-transform hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

export function RideReview({ rideId, reviewerId, revieweeId, revieweeName }: Props) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const { data: reviews } = useQuery({
    queryKey: ["ride-reviews", rideId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_reviews")
        .select("id, reviewer_id, reviewee_id, rating, comment, created_at")
        .eq("ride_id", rideId);
      if (error) throw error;
      return data;
    },
  });

  const mine = reviews?.find((r) => r.reviewer_id === reviewerId);
  const received = reviews?.find((r) => r.reviewee_id === reviewerId);

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
      toast.success("Avaliação enviada. Obrigado!");
      void qc.invalidateQueries({ queryKey: ["ride-reviews", rideId] });
      void qc.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: () => toast.error("Não foi possível enviar a avaliação."),
  });

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-lg">Avaliação</CardTitle>
        <CardDescription>
          {mine ? "Você já avaliou esta corrida." : `Como foi sua experiência com ${revieweeName}?`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {mine ? (
          <div className="space-y-2">
            <StarRating value={mine.rating} size="size-5" />
            {mine.comment && <p className="text-sm text-muted-foreground">“{mine.comment}”</p>}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <StarRating value={rating} onChange={setRating} />
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Conte como foi o cuidado com o pet, pontualidade e comunicação."
            />
            <Button type="submit" disabled={submit.isPending || !revieweeId}>
              {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Enviar avaliação
            </Button>
          </form>
        )}

        {received && (
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              O que disseram sobre você
            </p>
            <div className="mt-2">
              <StarRating value={received.rating} size="size-4" />
            </div>
            {received.comment && (
              <p className="mt-1 text-sm text-muted-foreground">“{received.comment}”</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
