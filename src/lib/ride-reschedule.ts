export function canAdminRescheduleRide(status: string) {
  return status === "pending" || status === "accepted";
}

export function saoPauloScheduleInput(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function parseRescheduleInput(input: string, tutorRequested: boolean, now = Date.now()) {
  if (!tutorRequested) throw new Error("Confirme que o tutor solicitou a alteração.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw new Error("Informe uma data e horário válidos.");
  const date = new Date(`${input}:00-03:00`);
  if (!Number.isFinite(date.getTime()) || saoPauloScheduleInput(date.toISOString()) !== input) throw new Error("Informe uma data e horário válidos.");
  if (date.getTime() <= now) throw new Error("Escolha uma data e horário futuros.");
  return date.toISOString();
}