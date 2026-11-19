import { formatShortDate as formatSharedShortDate, type Locale } from "@newsekolah/i18n";

/**
 * Where a library instant is read. `timeZone` is the school's
 * (useTenantTimeZone) and is required, even while it is `undefined` before
 * the session loads: an instant read without it lands on the device's day,
 * so a loan borrowed at 04.34 on 19 Nov at a Makassar school read "18 Nov"
 * on a phone set to Los Angeles. `today` ("2026-11-19") pins the current
 * year.
 */
export interface ShortDateOptions {
  timeZone: string | undefined;
  today?: string;
}

/** Midday UTC is the same calendar year in every school's zone. */
function yearAnchor(today: string | undefined): Date | undefined {
  return today ? new Date(`${today.slice(0, 10)}T12:00:00Z`) : undefined;
}

/** Two ends joined by an en dash like every range, or one day said once. */
function joinSpan(start: string, end: string): string {
  return start === end ? start : `${start} – ${end}`;
}

/**
 * An instant (a borrow, return or request time) as a phone row has room
 * for, on the school's calendar: "6 Okt", or "6 Okt 2025" outside the
 * current year. The library's call shape over the shared formatShortDate,
 * so library rows and dashboard hints always print a date the same way.
 */
export function formatShortDate(
  value: string,
  locale: Locale,
  { timeZone, today }: ShortDateOptions,
): string {
  return formatSharedShortDate(value, { locale, timeZone, now: yearAnchor(today) });
}

/**
 * A calendar date ("2026-10-06": a due date, a membership's last day, a
 * report's day) the same way, read as that day exactly. It has no time of
 * day, so no zone moves it and none is asked for.
 */
export function formatShortDay(
  day: string,
  locale: Locale,
  { today }: { today?: string } = {},
): string {
  return formatSharedShortDate(day.slice(0, 10), { locale, now: yearAnchor(today) });
}

/**
 * "25 Sep – 2 Okt": a loan's span between two instants, joined by an en
 * dash like every range. Each end drops the year inside the current one,
 * which a phone row needs and formatDateRange (always with the year) does
 * not do. A span within one day (a loan returned the day it was borrowed)
 * prints that day once, as the shared formatDateRange does.
 */
export function formatShortDateRange(
  from: string,
  to: string,
  locale: Locale,
  options: ShortDateOptions,
): string {
  return joinSpan(formatShortDate(from, locale, options), formatShortDate(to, locale, options));
}

/** The same span between two calendar dates (a loan rule's period). */
export function formatShortDayRange(
  from: string,
  to: string,
  locale: Locale,
  options: { today?: string } = {},
): string {
  return joinSpan(formatShortDay(from, locale, options), formatShortDay(to, locale, options));
}
