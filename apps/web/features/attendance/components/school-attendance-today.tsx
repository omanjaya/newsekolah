"use client";

import { Button, HeroCard, Progress } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { useAdminDashboardQuery } from "../../dashboard/api";

/** Only these roles may read the admin dashboard's snapshot (the server's isAdminCaller). */
const ADMIN_ROLES = new Set(["admin", "super_admin"]);

/**
 * The first screen of a reader who oversees attendance rather than taking
 * it: today's school-wide progress where the API offers it (administrators
 * read it from the admin dashboard snapshot), and the way to the reports
 * and the live monitor. `hint` says what else the page offers this reader.
 */
export function SchoolAttendanceToday({ hint }: { hint?: string }): ReactElement {
  const t = useTranslations("app.attendance.schoolToday");
  const { me } = useSession();
  const isAdmin = me?.roles.some((role) => ADMIN_ROLES.has(role.slug)) ?? false;
  const dashboard = useAdminDashboardQuery(isAdmin);
  const progress = dashboard.data?.attendance_today;
  const access = navAccessFromMe(me);
  // Offer only routes the page guard lets this reader open.
  const reportsHref = ["/attendance/reports", "/reports"].find((href) => canOpenPath(href, access));
  const canMonitor = canOpenPath("/monitor", access);
  const running = progress !== undefined && progress.total > 0;

  return (
    <div className="flex flex-col gap-3">
      <HeroCard
        tone="neutral"
        data-testid="school-attendance-today"
        eyebrow={t("eyebrow")}
        title={running ? t("progressTitle", progress) : t("title")}
        meta={running ? t("progressBody") : progress ? t("noneRunning") : t("body")}
        action={
          reportsHref && (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={reportsHref}>{t("openReports")}</Link>
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
