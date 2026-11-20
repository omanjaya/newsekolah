/**
 * ISO weekday (1 = Monday .. 7 = Sunday, the numbering a weekly lesson
 * block stores) of a "YYYY-MM-DD" calendar date; undefined for anything
 * else. Read in UTC, so the date is the same day wherever the browser is.
 */
export function isoWeekdayOf(date: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
