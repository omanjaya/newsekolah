/**
 * Calendar-cell dates are wall-calendar days built from local midnight, so
 * they must be keyed by their local year/month/day. `toISOString()` converts
 * to UTC first, which shifts a local-midnight date back one day in any zone
 * east of UTC (all of Indonesia).
 */
export function toISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The 42 cells (six Monday-first weeks) covering the month that contains `month`. */
export function buildMonthGrid(month: Date): { date: Date; inMonth: boolean }[] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const days: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(
      firstOfMonth.getFullYear(),
      firstOfMonth.getMonth(),
      1 - firstWeekday + i,
    );
    days.push({ date, inMonth: date.getMonth() === month.getMonth() });
  }
  return days;
}
