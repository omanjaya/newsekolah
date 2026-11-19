/**
 * A class's star balances by student id, or `null` while they are unknown
 * (still loading, or the request failed). Unknown is not zero: a sheet
 * that could not load the balances shows "-", never a row of false 0s.
 */
export type StarBalances = ReadonlyMap<string, number> | null;

/**
 * One student's star balance, or `null` while the class's balances are
 * unknown. A student missing from loaded balances has no stars yet.
 */
export function starBalanceOf(balances: StarBalances, studentId: string): number | null {
  if (balances === null) return null;
  return balances.get(studentId) ?? 0;
}

/** The star count a gradebook row shows for one student. */
export function starBalanceLabel(balances: StarBalances, studentId: string): string {
  return String(starBalanceOf(balances, studentId) ?? "-");
}
