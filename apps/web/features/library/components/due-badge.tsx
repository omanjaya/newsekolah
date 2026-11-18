"use client";

import type { Locale } from "@newsekolah/i18n";
import { Badge, type BadgeTone } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { classifyDueDate, overdueDays, type DueUrgency } from "../lib/due-date";
import { formatShortDate } from "../lib/short-date";

const URGENCY_TONE: Record<DueUrgency, BadgeTone> = {
  ok: "neutral",
  dueSoon: "warning",
  overdue: "danger",
};

/**
 * A loan's due date in the shared Badge, coloured by urgency, and never
 * colour alone: the text always says "Terlambat N hari" or the due date.
 * Shared by the desk's overdue queue, a member's loans, a student's own
 * loans and the kiosk. `compact` drops the due date from an overdue
 * label ("Terlambat 33 hari"), for a narrow row whose heading already says
 * why the loan is listed.
 */
export function DueBadge({
  dueOn,
  today,
  locale,
  compact = false,
  className,
}: {
  dueOn: string;
  today: string;
  locale: Locale;
  compact?: boolean;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.library.dueBadge");
  const urgency = classifyDueDate(dueOn, today);
  const date = formatShortDate(dueOn, locale, { today });
  const days = overdueDays(dueOn, today);
  const label =
    urgency !== "overdue"
      ? t("dueOn", { date })
      : compact
        ? t("overdueShort", { days })
        : t("overdue", { days, date });

  return (
    <Badge tone={URGENCY_TONE[urgency]} className={className}>
      {label}
    </Badge>
  );
}
