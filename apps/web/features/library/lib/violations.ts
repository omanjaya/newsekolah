import type { LibraryViolation } from "../violations-api";

type ViolationSettlement = Pick<LibraryViolation, "status" | "penalty" | "amount">;

/**
 * An unpaid fine with an amount: money the member owes. A warning or a
 * suspension carries no amount (a warning is stored settled; a suspension
 * is served by its dates), so neither ever reads as "unpaid fine Rp 0".
 */
export function isUnpaidFine(violation: ViolationSettlement): boolean {
  return violation.status === "unpaid" && violation.penalty === "fine" && violation.amount > 0;
}

/**
 * Something the member still has to settle: an unpaid fine with an amount
 * or a book to replace. The same rule as the server's clearance check
 * (queries/members.sql), so the page blocks "bebas pustaka" exactly when
 * the server would refuse it.
 */
export function isOutstandingViolation(violation: ViolationSettlement): boolean {
  return (
    isUnpaidFine(violation) ||
    (violation.status === "unpaid" && violation.penalty === "replace_book")
  );
}

/** The money owed across `violations`: the sum of their unpaid fines. */
export function unpaidFineTotal(violations: readonly ViolationSettlement[]): number {
  return violations.reduce((sum, v) => (isUnpaidFine(v) ? sum + v.amount : sum), 0);
}
