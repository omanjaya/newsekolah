"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { classifyDueDate, overdueDays } from "../lib/due-date";

const URGENCY_CLASS: Record<"ok" | "dueSoon" | "overdue", string> = {
  ok: "border-border bg-bg text-fg-muted",
  dueSoon: "border-status-late/40 bg-status-late/10 text-status-late",
  overdue: "border-status-absent/40 bg-status-absent/10 text-status-absent",
};

/**
 * A loan's due date with urgency color (never color alone -- the text
 * always spells out "terlambat N hari"), shared by the desk overdue
 * table, member detail's current loans, and a student's own loans.
 */
export function DueBadge({
  dueOn,
  today,
  locale,
  className,
}: {
  dueOn: string;
  today: string;
  locale: Locale;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.library.dueBadge");
  const urgency = classifyDueDate(dueOn, today);
  const date = formatDate(dueOn, { locale });
  const label =
    urgency === "overdue"
      ? t("overdue", { days: overdueDays(dueOn, today), date })
      : t("dueOn", { date });

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-xs border px-2 py-0.5 text-[12px] font-medium",
        URGENCY_CLASS[urgency],
        className,
      )}
    >
      {label}
    </span>
  );
}
