"use client";

import { Badge, StatusBadge } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { todayInZone } from "../../../lib/tenant-date";
import type { Bill } from "../api";
import { billDisplayStatus, billStatusToken } from "../lib/bill-status";

/**
 * One badge for every "is this bill paid" surface (bills list, bill
 * detail, the front desk's per-student cards) so paid/partial/overdue
 * never gets a different colour or label on different screens.
 */
export function BillStatusBadge({
  bill,
  namespace = "app.billing.bills",
}: {
  bill: Pick<Bill, "status" | "due_date">;
  /** Both `app.billing.bills.status.*` and `app.billing.paymentDesk.status.*` carry the same four keys. */
  namespace?: "app.billing.bills" | "app.billing.paymentDesk";
}): ReactElement {
  const t = useTranslations(namespace);
  const display = billDisplayStatus(bill, todayInZone());
  const token = billStatusToken(display);
  const label = t(`status.${display}`);
  if (!token) return <Badge variant="neutral">{label}</Badge>;
  return <StatusBadge status={token} label={label} />;
}
