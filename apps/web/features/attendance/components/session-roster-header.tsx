"use client";

import { Badge } from "@newsekolah/ui";
import { CheckCheck, RotateCcw } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { AppPage } from "../../../components/app-page";
import { useAllPeriodsQuery, useLookup } from "../../reference/api";
import { clockRange } from "../../schedule/clock-label";
import type { SessionDetail } from "../api";

/**
 * The roster's page frame, kept to two short lines so the first student
 * is on a phone's first screen: "Mapel · Kelas" as the title under a
 * breadcrumb back to the session list (the one way back), and one meta
 * line with the meeting, date and lesson time. The two bulk-roster actions
 * are the page's secondary actions: buttons on a wide screen, one menu on
 * a phone.
 *
 * Periods come from `useAllPeriodsQuery` (every template), not
 * `usePeriodsQuery` (the tenant's default template only): a schedule
 * built on a second, non-default timetable template -- e.g. a
 * bulk-imported one alongside a hand-built default -- has periods the
 * default-only lookup cannot resolve, which used to leave this line
 * blank instead of showing the actual period/time.
 */
export function SessionRosterHeader({
  session,
  className,
  subjectName,
  isCorrection,
  timeZone,
  onMarkAllPresent,
  onResetChanges,
  canReset,
  disabled,
  floating,
  children,
}: {
  session: SessionDetail;
  className: string;
  subjectName: string;
  isCorrection: boolean;
  timeZone?: string;
  onMarkAllPresent: () => void;
  onResetChanges: () => void;
  canReset: boolean;
  disabled: boolean;
  /** The sticky save bar, kept out of the entering content. */
  floating?: ReactNode;
  children?: ReactNode;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  const format = useFormatter();
  const locale = useLocale();
  const periods = useAllPeriodsQuery();
  const periodMap = useLookup(periods.data?.data);
  const start = periodMap.get(session.start_period_id);
  const end = periodMap.get(session.end_period_id);

  // Short enough for one line on a phone: "Jum, 13 Nov". Noon UTC keeps the
  // calendar date in any school time zone.
  const dateLabel = format.dateTime(new Date(`${session.date}T12:00:00Z`), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  });
  const timeRange = start && end ? clockRange(start.starts_at, end.ends_at, locale) : null;
  const meta = [t("eyebrow", { meeting: session.meeting_number }), dateLabel, timeRange]
    .filter(Boolean)
    .join(" · ");

  const titleParts = [subjectName, className].filter((part) => part.trim() !== "");
  const title = titleParts.length > 0 ? titleParts.join(" · ") : t("title");

  return (
    <AppPage
      title={title}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {isCorrection && (
            <Badge tone="warning" size="sm">
              {t("correctionMode")}
            </Badge>
          )}
          <span>{meta}</span>
        </span>
      }
      secondaryActions={[
        {
          label: t("markAllPresent"),
          icon: <CheckCheck />,
          onSelect: onMarkAllPresent,
          disabled,
        },
        {
          label: t("resetChanges"),
          icon: <RotateCcw />,
          onSelect: onResetChanges,
          disabled: disabled || !canReset,
        },
      ]}
      floating={floating}
    >
      {children}
    </AppPage>
  );
}
