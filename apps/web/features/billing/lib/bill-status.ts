import type { StatusName } from "@newsekolah/ui";

import type { BillStatus } from "../api";

/**
 * The front desk's own four states, derived from the API's `BillStatus`
 * plus the due date: a plain "unpaid" bill that is not yet due needs no
 * attention, while the same bill past its due date does. `bills.status`/
 * `paymentDesk.status` i18n keys cover all four (`unpaid`, `partial`,
 * `paid`, `overdue`).
 */
export type BillDisplayStatus = "paid" | "partial" | "overdue" | "unpaid";

const DISPLAY_TOKEN: Record<"paid" | "partial" | "overdue", StatusName> = {
  paid: "present",
  partial: "late",
  overdue: "absent",
};

export function billDisplayStatus(
  bill: { status: BillStatus; due_date: string },
  todayIso: string,
): BillDisplayStatus {
  if (bill.status === "paid") return "paid";
  if (bill.status === "partial") return "partial";
  return bill.due_date < todayIso ? "overdue" : "unpaid";
}

/**
 * Reuses the attendance status colour tokens (`packages/ui-tokens`) for the
 * three states that need the reader's attention -- green for paid, orange
 * for partial, red for overdue -- since those tokens are already the
 * app-wide vocabulary for "state that matters at a glance"
 * (`docs/07-ui-ux.md`). A plain not-yet-due "unpaid" bill is not an alarm
 * state, so it has no token and renders as a neutral `Badge` instead.
 */
export function billStatusToken(display: BillDisplayStatus): StatusName | undefined {
  return display === "unpaid" ? undefined : DISPLAY_TOKEN[display];
}
