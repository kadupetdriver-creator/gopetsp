import { reportDayBoundary, rideOccursWithin } from "./driver-payments";

export function earningsRangeError(start: string, end: string) {
  return start && end && start > end ? "A data final deve ser igual ou posterior à data inicial." : null;
}

export function matchesEarningsRange(timestamp: string, start: string, end: string) {
  if (earningsRangeError(start, end)) return false;
  return rideOccursWithin(
    timestamp,
    start ? new Date(reportDayBoundary(start)) : new Date(-8640000000000000),
    end ? new Date(reportDayBoundary(end, true)) : new Date(8640000000000000),
  );
}