import type { DateTimeFormatOptions, useFormatter } from "next-intl";

type Formatter = ReturnType<typeof useFormatter>;
type DateOptions = Omit<DateTimeFormatOptions, "timeZone">;

/** "13 Jul 2026": the default shape of a calendar date in a list or a table. */
const SHORT_DATE: DateOptions = { day: "numeric", month: "short", year: "numeric" };

/**
 * A calendar date ("2026-07-13", no time of day) placed at UTC midnight.
 * Formatted in UTC it is that day for everyone. Read at the browser's local
 * midnight (UTC+7 to +9 in Indonesia) and formatted in another zone, it
 * slid to the day before. A longer value (an instant) keeps its date part.
 */
export function calendarDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

/**
 * A YYYY-MM-DD calendar date as that day exactly: "13 Jul 2026" by
 * default, or any other date shape (`{ weekday: "long", day: "numeric",
 * month: "long" }`). Never pass an instant here: format it in the school's
 * zone with `format.dateTime` instead.
 */
export function formatCalendarDate(
  format: Formatter,
  value: string,
  options: DateOptions = SHORT_DATE,
): string {
  return format.dateTime(calendarDate(value), { ...options, timeZone: "UTC" });
}

/**
 * A span of calendar dates said once, joined by an en dash: "13 Jul 2026 –
 * 18 Jun 2027", "13–20 Jul 2026", or one date when both ends are the same
 * day.
 */
export function formatCalendarDateRange(
  format: Formatter,
  from: string,
  to: string,
  options: DateOptions = SHORT_DATE,
): string {
  const start = calendarDate(from);
  const end = calendarDate(to);
  const zoned = { ...options, timeZone: "UTC" };
  if (end.getTime() <= start.getTime()) return format.dateTime(start, zoned);
  return format.dateTimeRange(start, end, zoned);
}
