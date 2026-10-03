/**
 * Calendar helpers for form defaults. `toISOString()` is UTC, so before
 * 08:00 in Asia/Makassar it still reports yesterday; these read the wall
 * clock of the tenant (or the browser) instead.
 */
import { businessNow } from "./simulation/clock";

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
