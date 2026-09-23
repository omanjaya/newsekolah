/**
 * Calendar helpers for form defaults. `toISOString()` is UTC, so before
 * 08:00 in Asia/Makassar it still reports yesterday; these read the wall
 * clock of the tenant (or the browser) instead.
 */

/** "YYYY-MM-DD" for today in `timeZone` (the browser's zone when omitted). */
export function todayInZone(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "YYYY-MM" for the current month in `timeZone`. */
export function thisMonthInZone(timeZone?: string): string {
  return todayInZone(timeZone).slice(0, 7);
}

/**
 * A `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm") in the
 * browser's own zone, which is how the input and `new Date(value)` read it.
 */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
