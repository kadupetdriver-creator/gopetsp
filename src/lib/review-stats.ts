import { reportDayBoundary } from "./driver-payments";

/** Quantidade de avaliações recebidas mais recentes usadas na média (espelha recent_rating_average no banco). */
export const RATING_AVERAGE_WINDOW = 100;
export const LOW_RATING_MAX = 2;

export function isLowRating(rating: number) {
  return rating <= LOW_RATING_MAX;
}

/** Média das avaliações mais recentes; `ratings` deve vir da mais nova para a mais antiga. */
export function recentRatingAverage(ratings: readonly number[]) {
  const recent = ratings.slice(0, RATING_AVERAGE_WINDOW);
  if (recent.length === 0) return null;
  return Math.round((recent.reduce((s, r) => s + r, 0) / recent.length) * 100) / 100;
}

export function formatRatingAverage(average: number | string | null | undefined, count: number | string | null | undefined) {
  const n = Number(count ?? 0);
  if (!n || average === null || average === undefined || Number.isNaN(Number(average))) return "Sem avaliações";
  return Number(average).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type RatingFilter = "all" | "low" | "1" | "2" | "3" | "4" | "5";

export function matchesRatingFilter(rating: number, filter: RatingFilter) {
  if (filter === "all") return true;
  if (filter === "low") return isLowRating(rating);
  return rating === Number(filter);
}

/** Limites do período em horário de São Paulo, inclusivos. */
export function reviewPeriodBounds(start: string, end: string) {
  return {
    from: start ? reportDayBoundary(start) : null,
    to: end ? reportDayBoundary(end, true) : null,
  };
}
