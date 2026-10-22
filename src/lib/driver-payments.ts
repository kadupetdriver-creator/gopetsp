export function rideOccursWithin(scheduledAt: string, start: Date, end: Date) {
  const time = new Date(scheduledAt).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

export function expectedDriverPaymentDate(scheduledAt: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(scheduledAt));
  const date = new Date(`${day}T12:00:00-03:00`);
  const weekday = date.getUTCDay();
  const days = weekday >= 1 && weekday <= 4 ? 5 - weekday : weekday === 0 ? 1 : 8 - weekday;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function canRecordDriverPayment(ride: { status: string; driver_id: string | null; paid_at: string | null }) {
  return ride.status === "completed" && Boolean(ride.driver_id) && Boolean(ride.paid_at);
}

export function reportDayBoundary(dateIso: string, end = false) {
  const day = dateIso.slice(0, 10);
  return new Date(`${day}T${end ? "23:59:59.999" : "00:00:00.000"}-03:00`).toISOString();
}