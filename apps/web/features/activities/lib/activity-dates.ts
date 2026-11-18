import type { Locale } from "@newsekolah/i18n";

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-US" };

/** A calendar date ("2026-09-25") read as that day everywhere: parsed and formatted in UTC. */
function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

/**
 * An event's dates said once: "20 Sep 2026" for one day, "20–21 Sep 2026"
 * within a month, "30 Sep – 2 Okt 2026" across months (Intl's own range
 * format, so each locale joins them its own way).
 */
export function formatDayRange(from: string, to: string, locale: Locale): string {
  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const start = dateOnly(from);
  const end = dateOnly(to || from);
  if (end.getTime() <= start.getTime()) return format.format(start);
  return format.formatRange(start, end);
}
