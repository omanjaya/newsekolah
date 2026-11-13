"use client";

import { Button, EmptyState, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";

/** Landing for non-teaching staff: points to the school-wide views they can open. */
export function StaffAttendanceHub(): ReactElement {
  const t = useTranslations("app.attendance");
  const { me } = useSession();
  const access = navAccessFromMe(me);
  // Offer only routes the page guard lets this viewer open, so the hub never
  // leads to a Forbidden page.
  const reportsHref = ["/attendance/reports", "/reports"].find((href) => canOpenPath(href, access));
  const canViewMonitor = canOpenPath("/monitor", access);
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <AcademicWorkspaceLinks area="attendance" />
      <EmptyState
        icon={<domainIcons.attendance aria-hidden="true" />}
        title={t("staffHubTitle")}
        description={t("staffHubBody")}
        action={
          reportsHref || canViewMonitor ? (
            <div className="flex flex-wrap justify-center gap-2">
              {reportsHref && (
                <Button asChild size="sm">
                  <Link href={reportsHref}>{t("openReports")}</Link>
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
