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

/**
 * A span of minutes as whole hours and the minutes left over, for the hero
 * chips ("1 jam 20 menit lagi" instead of "80 menit lagi"); the catalog
 * owns the wording.
 */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.round(total));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

/** A lesson starting this many minutes ahead or sooner is "about to start": scanning in comes first. */
export const STARTING_SOON_MINUTES = 10;

/** Beyond this many minutes ahead a chip names the start time instead of the wait. */
export const LONG_WAIT_MINUTES = 180;

/** A wall-clock string ("08:40:00") as a UTC instant, for formatting with `timeZone: "UTC"`. */
export function clockInstant(value: string): Date {
  const minutes = parseClock(value);
  return new Date(Date.UTC(1970, 0, 1, Math.floor(minutes / 60), minutes % 60));
}
