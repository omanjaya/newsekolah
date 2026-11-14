import type { Locale } from "@newsekolah/i18n";

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-GB" };

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date as a phone row has room for: "6 Okt", or "6 Okt 2025" outside the
 * current year. A calendar date ("2026-10-06", a due date) is read as that
 * day exactly; an instant (a return time) is placed in the school's zone.
 */
export function formatShortDate(
  value: string,
  locale: Locale,
  { timeZone, today }: { timeZone?: string; today?: string } = {},
): string {
  const calendar = CALENDAR_DATE.test(value);
  const date = calendar ? new Date(`${value}T00:00:00Z`) : new Date(value);
  const zone = calendar ? "UTC" : timeZone;
  const year = new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: zone }).format(date);
  const currentYear = (today ?? new Date().toISOString()).slice(0, 4);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: year === currentYear ? undefined : "numeric",
    timeZone: zone,
  })
    .format(date)
    .replace(/\.$/, "");
}

/** "25 Sep - 2 Okt 2026": a loan's span, the year once at the end. */
export function formatShortDateRange(
  from: string,
  to: string,
  locale: Locale,
  options: { timeZone?: string; today?: string } = {},
): string {
  return `${formatShortDate(from, locale, options)} - ${formatShortDate(to, locale, options)}`;
}
