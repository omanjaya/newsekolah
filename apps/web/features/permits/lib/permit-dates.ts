import { formatDateRange, type Locale } from "@newsekolah/i18n";

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-GB" };

const DAY_MS = 86_400_000;

/**
 * A calendar date ("2026-09-25", no time of day) read as that day
 * everywhere: parsed and formatted in UTC, so a school west of Greenwich
 * never sees the day before.
 */
function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

/**
 * A leave's dates, said once: "25 Sep 2026" for one day, "25–27 Sep 2026"
 * within a month, "30 Sep – 2 Okt 2026" across months. The shared range
 * format, so leave dates read like every other range in the app.
 */
export function formatDayRange(startsOn: string, endsOn: string, locale: Locale): string {
  return formatDateRange(startsOn.slice(0, 10), endsOn.slice(0, 10), { locale });
}

/** How many calendar days a leave covers, both ends included (at least 1). */
export function countDays(startsOn: string, endsOn: string): number {
  const days = Math.round((dateOnly(endsOn).getTime() - dateOnly(startsOn).getTime()) / DAY_MS);
  return Math.max(1, days + 1);
}

/** A moment's day, short and with the weekday: "Kam, 25 Sep 2026", in the school's time zone. */
export function formatShortWeekdayDate(
  value: string,
  locale: Locale,
  timeZone: string | undefined,
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}
