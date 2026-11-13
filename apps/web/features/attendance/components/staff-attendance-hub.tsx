"use client";

import { Button, EmptyState, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";

/** Landing for non-teaching staff: points to the school-wide views they can open. */
export function StaffAttendanceHub(): ReactElement {
  const t = useTranslations("app.attendance");
  const canViewReports = useCan("view_reports");
  const canViewMonitor = useCan("view_monitor_presence");
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <AcademicWorkspaceLinks area="attendance" />
      <EmptyState
        icon={<domainIcons.attendance aria-hidden="true" />}
        title={t("staffHubTitle")}
        description={t("staffHubBody")}
        action={
          canViewReports || canViewMonitor ? (
            <div className="flex flex-wrap justify-center gap-2">
              {canViewReports && (
                <Button asChild size="sm">
                  <Link href="/attendance/reports">{t("openReports")}</Link>
                </Button>
              )}
              {canViewMonitor && (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/monitor">{t("openMonitor")}</Link>
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
