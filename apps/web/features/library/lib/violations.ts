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

/**
 * A suspension not yet settled. It is served by its dates and owes no
 * money, so it stays out of the unpaid total and the clearance check, but
 * staff still settle it on the violations page.
 */
export function isUnsettledSuspension(violation: ViolationSettlement): boolean {
  return violation.status === "unpaid" && violation.penalty === "suspend";
}

/**
 * Whether settling `violation` is a payment. Only a fine is: a suspension
 * is served by its dates, a warning is a note, and a book to replace is
 * owed as a book. Every screen that names a settlement (the status badge,
 * the row action, its confirmation and toast) asks this, so a sanction
 * without money never reads as "unpaid" or "paid".
 */
export function settlesByPayment(violation: Pick<LibraryViolation, "penalty">): boolean {
  return violation.penalty === "fine";
}

/** A key under app.library.violations.status. */
export type ViolationStatusLabelKey = "unpaid" | "paid" | "waived" | "open" | "done";

/**
 * The label key for a violation's settlement. The stored status (unpaid,
 * paid, waived) is shared by every penalty; a fine keeps the money words,
 * any other penalty reads as open or done. Waived ("Dibebaskan") carries
 * no money either way. A warning is stored settled when it is given and
 * staff never waive one by hand, so a settled warning always reads done
 * ("Selesai"), never as let off -- also one stored waived before the
 * server settled warnings as done.
 */
export function violationStatusLabelKey(
  violation: Pick<LibraryViolation, "status" | "penalty">,
): ViolationStatusLabelKey {
  if (violation.penalty === "warning") return violation.status === "unpaid" ? "open" : "done";
  if (violation.status === "waived" || settlesByPayment(violation)) return violation.status;
  return violation.status === "unpaid" ? "open" : "done";
}
