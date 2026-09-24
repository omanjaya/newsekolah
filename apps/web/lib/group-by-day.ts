/**
 * Buckets a chronologically-ordered list (newest first, as notifications
 * and announcements are already fetched) into day groups keyed by
 * "YYYY-MM-DD" in the given time zone -- the school's, not the browser's,
 * so "today" agrees with every other date shown in the app. Items already
 * in the caller's order are kept in that order within each group; the
 * groups themselves come out in first-seen order, so a newest-first input
 * stays newest-first without a second sort here.
 */
export interface DayGroup<T> {
  dateKey: string;
  items: T[];
}

export function groupByDay<T>(
  items: readonly T[],
  dateOf: (item: T) => string,
  timeZone?: string,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const byKey = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const key = dayKey(dateOf(item), timeZone);
    let group = byKey.get(key);
    if (!group) {
      group = { dateKey: key, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** "YYYY-MM-DD" for an ISO timestamp in `timeZone` (falls back to the runtime's own zone when omitted). */
export function dayKey(isoTimestamp: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoTimestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** A "YYYY-MM-DD" key shifted by `delta` days, staying in UTC so DST never skips a day. */
export function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
