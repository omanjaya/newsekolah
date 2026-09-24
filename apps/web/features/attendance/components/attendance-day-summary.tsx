"use client";

import { StatGrid, Stat } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The day's totals, next to the session list on a wide screen so the
 * page uses the width instead of sitting mostly empty next to a narrow
 * list (docs/07-ui-ux.md's desktop complaint).
 */
export function AttendanceDaySummary({
  total,
  saved,
  pending,
}: {
  total: number;
  saved: number;
  pending: number;
}): ReactElement {
  const t = useTranslations("app.attendance");
  return (
    <StatGrid className="grid-cols-1">
      <Stat label={t("summaryTotal")} value={total} />
      <Stat label={t("summarySaved")} value={saved} />
      <Stat label={t("summaryPending")} value={pending} />
    </StatGrid>
  );
}
