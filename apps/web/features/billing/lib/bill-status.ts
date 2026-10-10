import { semanticStatusToken, type StatusName } from "@newsekolah/ui";

import type { BillStatus } from "../api";

/**
 * The front desk's own four states, derived from the API's `BillStatus`
 * plus the due date: a plain "unpaid" bill that is not yet due needs no
 * attention, while the same bill past its due date does. `bills.status`/
 * `paymentDesk.status` i18n keys cover all four (`unpaid`, `partial`,
 * `paid`, `overdue`).
 */
export type BillDisplayStatus = "paid" | "partial" | "overdue" | "unpaid";

export function billDisplayStatus(
  bill: { status: BillStatus; due_date: string },
  todayIso: string,
): BillDisplayStatus {
  if (bill.status === "paid") return "paid";
  if (bill.status === "partial") return "partial";
  return bill.due_date < todayIso ? "overdue" : "unpaid";
}

/**
 * The colour token for a display status, from the shared semantic mapping
 * (`SEMANTIC_STATUS_TOKEN` in packages/ui): green for paid, orange for
 * partial, red for overdue. A plain not-yet-due "unpaid" bill is not an
 * alarm state, so it has no token and renders as a neutral badge.
 */
export function billStatusToken(display: BillDisplayStatus): StatusName | undefined {
  return semanticStatusToken(display) ?? undefined;
}
