import { instantFromSchoolTime, schoolDateTime } from "../../lib/simulation/clock";

/**
 * Staff attendance schedules store times as minutes since local midnight
 * (matching the API and the domain's `ScheduleDay`), but the time picker
 * reads and writes "HH:MM" strings. These two helpers are the only place
 * that conversion happens.
 */

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export function minutesToTimeInput(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, minutes));
  const hours = Math.floor(clamped / MINUTES_PER_HOUR);
  const mins = clamped % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function timeInputToMinutes(value: string): number {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const mins = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return 0;
  return hours * MINUTES_PER_HOUR + mins;
}

/**
 * An instant as the school's wall clock, "HH:mm" (or "" for none), the
 * value the shared time picker reads. Falls back to the browser's zone
 * while the school's is unknown.
 */
export function schoolClock(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  if (timeZone) return schoolDateTime(instant, timeZone).time;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

/**
 * The ISO instant a school date and wall-clock time stand for, or null when
 * the time is empty or invalid. A departure earlier than its arrival is a
 * night shift: pass the next day's date for it.
 */
export function schoolInstant(date: string, time: string, timeZone?: string): string | null {
  if (date === "" || time === "") return null;
  const instant = timeZone
    ? instantFromSchoolTime(date, time, timeZone)
    : new Date(`${date}T${time}`);
  return instant && !Number.isNaN(instant.getTime()) ? instant.toISOString() : null;
}

/**
 * "YYYY-MM-DD" shifted by `days` (negative goes back), staying in UTC so a
 * daylight-saving transition never skips or repeats a calendar day --
 * mirrors `attendance-view.tsx`'s local `shiftDate`, needed here too for
 * the self check-in screen's rolling "this week" range.
 */
export function shiftDateISO(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
