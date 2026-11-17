import type { BoardEntry } from "../api";

/** Whole minutes from `from` (an ISO instant) to `now`, never negative. */
export function minutesSince(from: string, now: Date): number {
  const start = Date.parse(from);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 60_000));
}

/**
 * The order a guard deals with the board in: visitors still here past the
 * school day first, then whoever has been on site the longest.
 */
export function sortBoardEntries(entries: readonly BoardEntry[]): BoardEntry[] {
  return [...entries].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      Date.parse(a.visit.arrived_at) - Date.parse(b.visit.arrived_at),
  );
}

/** Case-insensitive match of a trimmed search against any of the given fields. */
export function matchesSearch(search: string, ...fields: (string | undefined)[]): boolean {
  const query = search.trim().toLocaleLowerCase();
  if (query === "") return true;
  return fields.some((field) => (field ?? "").toLocaleLowerCase().includes(query));
}
