"use client";

import { cn, StatGrid, Stat } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The day's totals. Two layouts, not one component reused at two sizes:
 * `compact` is a single inline strip for a phone, sitting above the
 * session list rather than as three stacked full-width blocks after it
 * (docs/07-ui-ux.md); the full `StatGrid` stays as the desktop side
 * panel, where the page has width to spare next to the list.
 */
export function AttendanceDaySummary({
  total,
  saved,
  pending,
  compact = false,
  className,
}: {
  total: number;
  saved: number;
  pending: number;
  compact?: boolean;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.attendance");

  if (compact) {
    return (
      <div
        className={cn("flex items-center gap-3 text-[13px] text-fg-muted", className)}
        aria-label={`${t("summaryTotal")} ${total}, ${t("summarySaved")} ${saved}, ${t("summaryPending")} ${pending}`}
      >
        <span>
          <span className="font-medium tabular-nums text-fg">{total}</span> {t("summaryTotal")}
        </span>
        <span aria-hidden="true">&middot;</span>
        <span>
          <span className="font-medium tabular-nums text-fg">{saved}</span> {t("summarySaved")}
        </span>
        <span aria-hidden="true">&middot;</span>
        <span>
          <span className="font-medium tabular-nums text-fg">{pending}</span> {t("summaryPending")}
        </span>
      </div>
    );
  }

  return (
    <StatGrid className={cn("grid-cols-1", className)}>
      <Stat label={t("summaryTotal")} value={total} />
      <Stat label={t("summarySaved")} value={saved} />
      <Stat label={t("summaryPending")} value={pending} />
    </StatGrid>
  );
}
