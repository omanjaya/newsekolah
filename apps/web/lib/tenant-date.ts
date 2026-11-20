/**
 * Calendar helpers for form defaults. `toISOString()` is UTC, so before
 * 08:00 in Asia/Makassar it still reports yesterday; these read the wall
 * clock of the tenant (or the browser) instead.
 */
import { businessNow, instantFromSchoolTime, schoolDateTime } from "./simulation/clock";

/** "YYYY-MM-DD" for today in `timeZone` (the browser's zone when omitted). */
export function todayInZone(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(businessNow());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "YYYY-MM" for the current month in `timeZone`. */
export function thisMonthInZone(timeZone?: string): string {
  return todayInZone(timeZone).slice(0, 7);
}

/**
 * `iso` ("YYYY-MM-DD") shifted by a number of calendar days (may cross
 * month/year boundaries). Pure calendar arithmetic -- once a date carries a
 * tenant's timezone (e.g. via `todayInZone`), shifting it by whole days
 * never needs the timezone again.
 */
export function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** ISO weekday (1 Monday .. 7 Sunday) of `iso` ("YYYY-MM-DD"), the API's day_of_week. */
export function isoWeekdayOf(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

/** The first day of the month containing `iso` ("YYYY-MM-DD"). */
export function startOfIsoMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** The first day of the month before the one containing `iso`. */
export function startOfPreviousIsoMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
}

/** The last day of the month before the one containing `iso`. */
export function endOfPreviousIsoMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

/**
 * A `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm") in the
 * browser's own zone, which is how the input and `new Date(value)` read it.
 */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm") for an
 * instant as the wall clock in `timeZone` (the school's) reads it, so a
 * device set to another zone still shows the school's hour. Without a zone
 * it is the browser's, like `toDateTimeLocalValue`.
 */
export function isoToZonedLocal(instant: string | Date, timeZone?: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return "";
  if (!timeZone) return toDateTimeLocalValue(date);
  const local = schoolDateTime(date, timeZone);
  return `${local.date}T${local.time}`;
}

/**
 * The ISO instant a "YYYY-MM-DDTHH:mm" value stands for on the wall clock
 * in `timeZone` (the school's), or null when it is empty or not a real
 * time. `new Date(value)` would read it in the device's zone instead.
 */
export function zonedLocalToIso(value: string, timeZone?: string): string | null {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const instant = timeZone
    ? instantFromSchoolTime(date, time, timeZone)
    : new Date(`${date}T${time}`);
  return instant && !Number.isNaN(instant.getTime()) ? instant.toISOString() : null;
}

/** The UTC instant at which the wall clock in `timeZone` reads `date` at `time` ("HH:mm:ss"). */
function instantInZone(date: string, time: string, timeZone: string | undefined): Date {
  if (!timeZone) {
    // The browser's own zone: parse the wall-clock string as local time.
    return new Date(`${date}T${time}`);
  }
  const guess = new Date(`${date}T${time}Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return new Date(guess.getTime() - (asIfUtc - guess.getTime()));
}

/** The ISO instant the school's day `date` ("YYYY-MM-DD") starts at in `timeZone`. */
export function startOfDayInZone(date: string, timeZone?: string): string {
  return instantInZone(date, "00:00:00", timeZone).toISOString();
}

/**
 * The last millisecond of the school's day `date` ("YYYY-MM-DD") in
 * `timeZone`: one before the next day starts, so an inclusive `<=` filter
 * keeps events stamped in the day's final second.
 */
export function endOfDayInZone(date: string, timeZone?: string): string {
  const nextStart = instantInZone(shiftIsoDate(date, 1), "00:00:00", timeZone);
  return new Date(nextStart.getTime() - 1).toISOString();
}

/**
 * ISO range covering whole calendar days `from`..`to` ("YYYY-MM-DD") as the
 * school lives them, for APIs that filter on a timestamp. Plain `T00:00:00Z`
 * bounds are UTC midnights and drop the first hours of the tenant's first day.
 */
export function dayRangeInZone(
  from: string,
  to: string,
  timeZone?: string,
): { from: string; to: string } {
  return { from: startOfDayInZone(from, timeZone), to: endOfDayInZone(to, timeZone) };
}
