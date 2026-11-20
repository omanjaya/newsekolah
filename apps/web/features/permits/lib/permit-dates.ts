import { formatDateRange, type Locale } from "@newsekolah/i18n";

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-GB" };

/**
 * A leave's dates, said once: "25 Sep 2026" for one day, "25–27 Sep 2026"
 * within a month, "30 Sep – 2 Okt 2026" across months. The shared range
 * format, so leave dates read like every other range in the app.
 */
export function formatDayRange(startsOn: string, endsOn: string, locale: Locale): string {
  return formatDateRange(startsOn.slice(0, 10), endsOn.slice(0, 10), { locale });
}

/**
 * A moment's day, short, in the school's time zone: "Kam, 25 Sep" within
 * the school's current year (`today`, "YYYY-MM-DD"), "25 Sep 2025"
 * outside it or without `today`. The year is dropped where it says
 * nothing, as the shared formatShortDate does, and the weekday where the
 * year is shown: a day months back is placed by its year, not its weekday,
 * and either way the date stays as short as "Kam, 25 Sep", so it fits a
 * 320px phone row whole instead of losing its year to an ellipsis.
 */
export function formatShortWeekdayDate(
  value: string,
  locale: Locale,
  timeZone: string | undefined,
  today?: string,
): string {
  const date = new Date(value);
  const yearOf = (instant: Date) =>
    new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone }).format(instant);
  // Midday UTC is the same calendar year in every school's zone.
  const sameYear =
    today !== undefined && yearOf(date) === yearOf(new Date(`${today.slice(0, 10)}T12:00:00Z`));
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: sameYear ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone,
  }).format(date);
}
