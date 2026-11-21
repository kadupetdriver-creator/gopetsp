import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LockKeyhole, MessageSquare, PawPrint, Route as RouteIcon, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSignedPhoto } from "@/components/PhotoChangeCard";
import { PawRating } from "@/components/RideReview";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { earningsRangeError } from "@/lib/driver-earnings-range";
import { formatDateTime } from "@/lib/rides";
import {
  formatRatingAverage,
  isLowRating,
  matchesRatingFilter,
  RATING_AVERAGE_WINDOW,
  reviewPeriodBounds,
  type RatingFilter,
} from "@/lib/review-stats";

export const Route = createFileRoute("/admin/avaliacoes")({
  head: () => ({
    meta: [
      { title: "Avaliações | Admin GoPet SP" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Gerencie as avaliações em patinhas recebidas por tutores e motoristas da GoPet SP." },
      { property: "og:title", content: "Avaliações | Admin GoPet SP" },
      { property: "og:description", content: "Médias, comentários e notas baixas de tutores e motoristas." },
    ],
  }),
  component: AdminReviews,
});

type RoleFilter = "all" | "tutor" | "driver";
type Summary = {
  user_id: string;
  full_name: string;
  role: "tutor" | "driver";
  avatar_path: string | null;
  average_rating: number | null;
  rating_count: number;
  low_rating_count: number;
  last_review_at: string | null;
};

const REVIEW_LIMIT = 500;
const PAGE = 20;
const roleLabel = { tutor: "Tutor", driver: "Motorista" } as const;

function Avatar({ path, name, size = "size-12" }: { path: string | null; name: string; size?: string }) {
  const url = useSignedPhoto(path);
  return url ? (
    <img src={url} alt={`Foto de ${name}`} className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground`}>
      <UserRound className="size-1/2" />
    </span>
  );
}

function AdminReviews() {
  const qc = useQueryClient();
  const [role, setRole] = useState<RoleFilter>("all");
  const [userId, setUserId] = useState<string>("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rating, setRating] = useState<RatingFilter>("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const rangeError = earningsRangeError(start, end);

  const summaries = useQuery({
    queryKey: ["admin-rating-summaries"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_rating_summaries");
      if (error) throw error;
      return (data ?? []) as Summary[];
    },
  });

  const reviews = useQuery({
    queryKey: ["admin-reviews", userId, start, end, rating],
    enabled: !rangeError,
    queryFn: async () => {
      const { from, to } = reviewPeriodBounds(start, end);
      let q = supabase
        .from("ride_reviews")
        .select("id, ride_id, reviewer_id, reviewee_id, rating, comment, created_at")
        .order("created_at", { ascending: false })
        .limit(REVIEW_LIMIT);
      if (userId !== "all") q = q.eq("reviewee_id", userId);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      if (rating === "low") q = q.lte("rating", 2);
      else if (rating !== "all") q = q.eq("rating", Number(rating));
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      const rideIds = [...new Set(rows.map((r) => r.ride_id))];
      const rides = new Map<string, { pet_name: string; scheduled_at: string; origin_address: string; destination_address: string }>();
      for (let i = 0; i < rideIds.length; i += 100) {
        const { data: chunk } = await supabase
          .from("rides")
          .select("id, pet_name, scheduled_at, origin_address, destination_address")
          .in("id", rideIds.slice(i, i + 100));
        for (const r of chunk ?? []) rides.set(r.id, r);
      }
      return rows.map((r) => ({ ...r, ride: rides.get(r.ride_id) ?? null }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`admin-reviews-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ride_reviews" }, () => {
        void qc.invalidateQueries({ queryKey: ["admin-rating-summaries"] });
        void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);

  const byId = useMemo(() => new Map((summaries.data ?? []).map((s) => [s.user_id, s])), [summaries.data]);
  const people = useMemo(
    () => (summaries.data ?? [])
      .filter((s) => role === "all" || s.role === role)
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "pt-BR")),
    [summaries.data, role],
  );
  const listed = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return term ? people.filter((p) => (p.full_name || "").toLocaleLowerCase("pt-BR").includes(term)) : people;
  }, [people, search]);
  const shownReviews = useMemo(
    () => (reviews.data ?? []).filter((r) => {
      if (!matchesRatingFilter(r.rating, rating)) return false;
      if (role === "all") return true;
      return byId.get(r.reviewee_id)?.role === role;
    }),
    [reviews.data, rating, role, byId],
  );

  const reviewed = people.filter((p) => p.rating_count > 0);
  const totalReviews = reviewed.reduce((s, p) => s + Number(p.rating_count), 0);
  const totalLow = reviewed.reduce((s, p) => s + Number(p.low_rating_count), 0);
  const selected = userId !== "all" ? byId.get(userId) : undefined;
  const hasFilters = userId !== "all" || start || end || rating !== "all" || role !== "all";

  if (summaries.error) return <p className="text-sm text-destructive">Acesso restrito à administração.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Avaliações</h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          Notas e comentários individuais são visíveis apenas para administradores. A média considera as {RATING_AVERAGE_WINDOW} avaliações recebidas mais recentes.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Avaliados" value={String(reviewed.length)} />
        <Stat label="Avaliações" value={String(totalReviews)} />
        <Stat label="Até 2 patinhas" value={String(totalLow)} alert={totalLow > 0} />
      </div>

      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={role} onValueChange={(v) => { setRole(v as RoleFilter); setUserId("all"); setVisible(PAGE); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutores e motoristas</SelectItem>
                <SelectItem value="tutor">Tutores</SelectItem>
                <SelectItem value="driver">Motoristas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Usuário</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "Sem nome"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rev-start">De</Label>
            <Input id="rev-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rev-end">Até</Label>
            <Input id="rev-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nota</Label>
            <Select value={rating} onValueChange={(v) => setRating(v as RatingFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="low">Até 2 patinhas</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "patinha" : "patinhas"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rangeError && <p className="text-sm text-destructive sm:col-span-2 lg:col-span-5">{rangeError}</p>}
          {hasFilters && (
            <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => { setRole("all"); setUserId("all"); setStart(""); setEnd(""); setRating("all"); }}>
              <X className="size-4" /> Limpar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {selected && <PersonCard person={selected} active onSelect={() => setUserId("all")} />}

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4 text-primary-ink" /> Avaliações individuais</h3>
        {reviews.isLoading || summaries.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : shownReviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma avaliação encontrada com esses filtros.</p>
        ) : (
          <>
            {shownReviews.map((r) => {
              const low = isLowRating(r.rating);
              const reviewee = byId.get(r.reviewee_id);
              const reviewer = byId.get(r.reviewer_id);
              return (
                <Card key={r.id} className={low ? "border-destructive/60 bg-destructive/5 shadow-soft" : "shadow-soft"}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PawRating value={r.rating} size="size-5" />
                        {low && <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" /> Nota baixa</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
                    </div>
                    <p className="text-sm">
                      <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => setUserId(r.reviewee_id)}>
                        {reviewee?.full_name || "Sem nome"}
                      </button>
                      {reviewee && <span className="text-muted-foreground"> ({roleLabel[reviewee.role]})</span>}
                      <span className="text-muted-foreground"> avaliado por </span>
                      <span className="font-medium">{reviewer?.full_name || "Sem nome"}</span>
                    </p>
                    {r.comment ? (
                      <p className="rounded-md bg-secondary px-3 py-2 text-sm">“{r.comment}”</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem comentário.</p>
                    )}
                    {r.ride && (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <RouteIcon className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          Corrida de {r.ride.pet_name} · {formatDateTime(r.ride.scheduled_at)} · {r.ride.origin_address} → {r.ride.destination_address} · #{r.ride_id.slice(0, 8)}
                        </span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {(reviews.data?.length ?? 0) >= REVIEW_LIMIT && (
              <p className="text-xs text-muted-foreground">Mostrando as {REVIEW_LIMIT} mais recentes. Use os filtros para refinar.</p>
            )}
          </>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold"><PawPrint className="size-4 text-primary-ink" /> Médias por usuário</h3>
        <Input placeholder="Buscar por nome" value={search} onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }} />
        {listed.slice(0, visible).map((p) => (
          <PersonCard key={p.user_id} person={p} active={p.user_id === userId} onSelect={() => { setUserId(p.user_id); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        ))}
        {listed.length === 0 && !summaries.isLoading && <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>}
        {listed.length > visible && (
          <Button variant="outline" className="w-full" onClick={() => setVisible((v) => v + PAGE)}>Mostrar mais</Button>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alert ? "border-destructive/50 bg-destructive/5" : "bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${alert ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function PersonCard({ person, active, onSelect }: { person: Summary; active?: boolean; onSelect: () => void }) {
  const count = Number(person.rating_count);
  const avgText = formatRatingAverage(person.average_rating, count);
  return (
    <Card className={`shadow-soft ${active ? "border-primary" : ""}`}>
      <CardContent className="flex items-center gap-3 p-3">
        <Avatar path={person.avatar_path} name={person.full_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{person.full_name || "Sem nome"}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Badge variant="secondary">{roleLabel[person.role]}</Badge>
            {count > 0 ? (
              <>
                <span className="flex items-center gap-1 font-semibold text-primary-ink"><PawPrint className="size-4" /> {avgText}</span>
                <span className="text-muted-foreground">{count} {count === 1 ? "avaliação" : "avaliações"}</span>
                {Number(person.low_rating_count) > 0 && (
                  <span className="text-destructive">{person.low_rating_count} até 2 patinhas</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Sem avaliações</span>
            )}
          </div>
        </div>
        {count > 0 && (
          <Button variant={active ? "secondary" : "outline"} size="sm" onClick={onSelect}>{active ? "Ver todos" : "Ver"}</Button>
        )}
      </CardContent>
    </Card>
  );
}
