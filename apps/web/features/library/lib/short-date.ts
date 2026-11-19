import { formatShortDate as formatSharedShortDate, type Locale } from "@newsekolah/i18n";

/**
 * A date as a phone row has room for: "6 Okt", or "6 Okt 2025" outside the
 * current year. A calendar date ("2026-10-06", a due date) is read as that
 * day exactly; an instant (a return time) is placed in the school's zone.
 * The library's call shape over the shared formatShortDate, so library
 * rows and dashboard hints always print a date the same way. `today`
 * ("2026-11-19") pins the current year.
 */
export function formatShortDate(
  value: string,
  locale: Locale,
  { timeZone, today }: { timeZone?: string; today?: string } = {},
): string {
  return formatSharedShortDate(value, {
    locale,
    timeZone,
    // Midday UTC is the same calendar year in every school's zone.
    now: today ? new Date(`${today.slice(0, 10)}T12:00:00Z`) : undefined,
  });
}

/**
 * "25 Sep – 2 Okt": a loan's span, joined by an en dash like every range.
 * Each end drops the year inside the current one, which a phone row needs
 * and formatDateRange (always with the year) does not do.
 */
export function formatShortDateRange(
  from: string,
  to: string,
  locale: Locale,
  options: { timeZone?: string; today?: string } = {},
): string {
  return `${formatShortDate(from, locale, options)} – ${formatShortDate(to, locale, options)}`;
}
