export function validPawRating(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function nextPendingReview<T extends { ride_id: string }>(rows: T[], deferred: readonly string[]) {
  return rows.find((row) => !deferred.includes(row.ride_id)) ?? null;
}