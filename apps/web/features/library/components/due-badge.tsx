"use client";

import type { Locale } from "@newsekolah/i18n";
import { Badge, type BadgeTone } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { classifyDueDate, overdueDays, type DueUrgency } from "../lib/due-date";
import { formatShortDay } from "../lib/short-date";

const URGENCY_TONE: Record<DueUrgency, BadgeTone> = {
  ok: "neutral",
  dueSoon: "warning",
  overdue: "danger",
};

/**
 * A loan's due date in the shared Badge, coloured by urgency, and never
 * colour alone: the text always says how late the loan is, in which unit,
 * or the due date. Shared by the desk's overdue queue, a member's loans,
 * a student's own loans and the kiosk. `compact` drops the due date from
 * an overdue label, for a narrow row whose heading already says why the
 * loan is listed.
 *
 * `lateDays` is the server's working-day count (closed weekend days and
 * holidays not counted), the days a return now is charged for. When given
 * the badge shows it as "hari kerja", so the desk's overdue list and its
 * return line agree; without it the badge can only count calendar days
 * and says so ("hari kalender").
 */
export function DueBadge({
  dueOn,
  today,
  locale,
  lateDays,
  compact = false,
  className,
}: {
  dueOn: string;
  today: string;
  locale: Locale;
  lateDays?: number;
  compact?: boolean;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.library.dueBadge");
  const urgency = classifyDueDate(dueOn, today);
  const date = formatShortDay(dueOn, locale, { today });
  const label = (() => {
    if (urgency !== "overdue") return t("dueOn", { date });
    if (lateDays === undefined) {
      const days = overdueDays(dueOn, today);
      return compact ? t("overdueShort", { days }) : t("overdue", { days, date });
    }
    // Past the due date only by closed days: nothing is charged yet.
    if (lateDays <= 0) return t("pastDue");
    return compact
      ? t("overdueWorkingShort", { days: lateDays })
      : t("overdueWorking", { days: lateDays, date });
  })();

  return (
    <Badge tone={URGENCY_TONE[urgency]} className={className}>
      {label}
    </Badge>
  );
}
