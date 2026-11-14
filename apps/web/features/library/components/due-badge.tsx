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
 * loans and the kiosk.
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
  const date = formatShortDate(dueOn, locale, { today });
  const label =
    urgency === "overdue"
      ? t("overdue", { days: overdueDays(dueOn, today), date })
      : t("dueOn", { date });

  return (
    <Badge tone={URGENCY_TONE[urgency]} className={className}>
      {label}
    </Badge>
  );
}
