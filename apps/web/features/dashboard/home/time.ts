function zoneParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { hour: Number(get("hour")), minute: Number(get("minute")), weekday: get("weekday") };
}

/** Minutes since local midnight in `timeZone`. */
export function minutesInZone(now: Date, timeZone: string): number {
  const { hour, minute } = zoneParts(now, timeZone);
  return hour * 60 + minute;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** ISO weekday (Monday=1 .. Sunday=7) of `now` in `timeZone`. */
export function isoWeekdayInZone(now: Date, timeZone: string): number {
  return WEEKDAYS.indexOf(zoneParts(now, timeZone).weekday) + 1;
}

/** "08:40" or "08:40:00" -> minutes since midnight. */
export function parseClock(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

export interface TimeRange {
  start: number;
  end: number;
}

/** The item currently running, else the next one, else undefined for "nothing left today". */
export function pickCurrentOrNext<T extends TimeRange>(
  items: T[],
  nowMinutes: number,
): { item: T; state: "now" | "next" } | undefined {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const running = sorted.find((i) => i.start <= nowMinutes && nowMinutes < i.end);
  if (running) return { item: running, state: "now" };
  const next = sorted.find((i) => i.start > nowMinutes);
  return next ? { item: next, state: "next" } : undefined;
}

/** Rounded percent of `attended` statuses among the days that have a status at all. */
export function attendanceRate(
  statuses: readonly (string | null | undefined)[],
  attended: readonly string[],
): number | undefined {
  const known = statuses.filter((s): s is string => Boolean(s));
  if (known.length === 0) return undefined;
  return Math.round((known.filter((s) => attended.includes(s)).length / known.length) * 100);
}
