/**
 * The text of a "dateRange" filter pill. Kept apart from the pill so the
 * wording rules (one day, a compact span, an open-ended bound) read and
 * test on their own.
 */

/**
 * The en dash between the bounds of a span, as every other range in the
 * app is written ("1–19 Nov 2026", "20 Nov 2026 – 1 Jan 2030"): closed up
 * between two days of one month, spaced between two full dates.
 */
const RANGE_DASH = "–";

/**
 * "YYYY-MM-DD" -> "6 Sep" / "6 Sep 2026". The month name comes from `Intl`
 * in the page's language (so it is never a hardcoded locale's spelling), but the
 * day-month-year order is fixed here rather than left to a full `Intl`
 * format, which in several locales would reorder it (e.g. "Sep 6, 2026").
 */
function formatDayMonth(value: string, withYear: boolean): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  // The page's own language (set by the app on <html lang>), not the
  // browser's, so an English-language browser still reads "Okt" on an
  // Indonesian page.
  const locale =
    typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined;
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(date);
  return withYear
    ? `${date.getDate()} ${month} ${date.getFullYear()}`
    : `${date.getDate()} ${month}`;
}

/**
 * The pill's value: one date for a single day, a compact span for two
 * bounds (in calendar order, so a reversed pair from a hand-edited link
 * still reads "1–19 Nov 2026"), and an open-ended bound worded as such, so
 * "from 19 Nov on" never reads like the single day 19 Nov.
 */
export function formatDateRange(
  from: string,
  to: string,
  since: (date: string) => string,
  until: (date: string) => string,
): string {
  if (from && to) {
    const [start, end] = from <= to ? [from, to] : [to, from];
    if (start === end) return formatDayMonth(start, true);
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();
    if (sameMonth) return `${startDate.getDate()}${RANGE_DASH}${formatDayMonth(end, true)}`;
    return `${formatDayMonth(start, !sameYear)} ${RANGE_DASH} ${formatDayMonth(end, true)}`;
  }
  if (from) return since(formatDayMonth(from, true));
  return until(formatDayMonth(to, true));
}
