"use client";

import { Button, HeroCard, Progress } from "@newsekolah/ui";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { useAdminDashboardQuery } from "../../dashboard/api";

/**
 * Only these roles may read the admin dashboard's snapshot: the server's
 * isAdminCaller (analytics/transport/http/dashboard.go). The vice principal
 * is not one of them, so the card does not ask on their behalf.
 */
const ADMIN_ROLES = new Set(["admin", "super_admin", "principal"]);

export interface SchoolAttendanceTodayProps {
  /** What else the page offers this reader, under the card. */
  hint?: string;
  /**
   * The day the page shows ("YYYY-MM-DD"). Away from `today` the live
   * snapshot does not apply, so the card names that day and sends the
   * reader to its report instead.
   */
  date?: string;
  /** The school's today ("YYYY-MM-DD"). */
  today?: string;
}

/**
 * The first screen of a reader who oversees attendance rather than taking
 * it: today's school-wide progress where the API offers it (administrators
 * and the principal read it from the admin dashboard snapshot), and the way
 * to the reports and the live monitor. On another day it offers that day's
 * report, since the snapshot only covers today.
 */
export function SchoolAttendanceToday({
  hint,
  date,
  today,
}: SchoolAttendanceTodayProps): ReactElement {
  const t = useTranslations("app.attendance.schoolToday");
  const format = useFormatter();
  const { me } = useSession();
  const otherDay = date !== undefined && today !== undefined && date !== today;
  const isAdmin = me?.roles.some((role) => ADMIN_ROLES.has(role.slug)) ?? false;
  const dashboard = useAdminDashboardQuery(isAdmin && !otherDay);
  const progress = otherDay ? undefined : dashboard.data?.attendance_today;
  const access = navAccessFromMe(me);
  // Offer only routes the page guard lets this reader open, and name them
  // for what they are: the attendance report, or else the report centre.
  const reportsHref = ["/attendance/reports", "/reports"].find((href) => canOpenPath(href, access));
  // The attendance report opens on the chosen day; the report centre has
  // no day of its own.
  const reportsLink =
    otherDay && reportsHref === "/attendance/reports"
      ? `${reportsHref}?${new URLSearchParams({ date }).toString()}`
      : reportsHref;
  // The monitor is live, so it belongs to today only.
  const canMonitor = !otherDay && canOpenPath("/monitor", access);
  const running = progress !== undefined && progress.total > 0;
  // The body promises the monitor only to a reader who is offered it.
  const body = canMonitor ? t("body") : t("bodyReportsOnly");

  const eyebrow = otherDay
    ? t("dayEyebrow", {
        date: formatCalendarDate(format, date, {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
      })
    : t("eyebrow");
  const title = otherDay ? t("dayTitle") : running ? t("progressTitle", progress) : t("title");
  const meta = otherDay
    ? t("dayBody")
    : running
      ? t("progressBody")
      : progress
        ? t("noneRunning")
        : body;

  return (
    <div className="flex flex-col gap-3">
      <HeroCard
        tone="neutral"
        data-testid="school-attendance-today"
        eyebrow={eyebrow}
        title={title}
        meta={meta}
        action={
          reportsLink && (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={reportsLink}>
                {reportsHref === "/reports" ? t("openReportsHub") : t("openReports")}
              </Link>
            </Button>
          )
        }
        secondaryAction={
          canMonitor && (
            <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
              <Link href="/monitor">{t("openMonitor")}</Link>
            </Button>
          )
        }
      >
        {running && (
          <Progress
            value={progress.submitted}
            max={progress.total}
            aria-label={t("progressTitle", progress)}
            className="max-w-sm pt-1"
          />
        )}
      </HeroCard>
      {hint && <p className="text-body-sm text-fg-muted">{hint}</p>}
    </div>
  );
}
