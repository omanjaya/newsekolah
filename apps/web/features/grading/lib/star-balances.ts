/**
 * A class's star balances by student id, or `null` while they are unknown
 * (still loading, or the request failed). Unknown is not zero: a sheet
 * that could not load the balances shows "-", never a row of false 0s.
 */
export type StarBalances = ReadonlyMap<string, number> | null;

/** The star count a gradebook row shows for one student. */
export function starBalanceLabel(balances: StarBalances, studentId: string): string {
  if (balances === null) return "-";
  return String(balances.get(studentId) ?? 0);
}
