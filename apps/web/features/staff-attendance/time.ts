/**
 * Staff attendance schedules store times as minutes since local midnight
 * (matching the API and the domain's `ScheduleDay`), but an `<input
 * type="time">` reads and writes "HH:MM" strings. These two helpers are
 * the only place that conversion happens.
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
 * Converts an ISO timestamp to the "YYYY-MM-DDTHH:MM" shape an
 * `<input type="datetime-local">` expects, in the browser's local time --
 * same approach as `toLocalInput` in
 * features/discipline/components/counseling-form.tsx.
 */
export function isoToDateTimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converts a `datetime-local` input value back to an ISO timestamp. */
export function dateTimeLocalToIso(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
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
