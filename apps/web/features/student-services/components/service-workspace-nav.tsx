"use client";

import { Button } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { registryLabelKey } from "../../../lib/navigation-labels";
import { useCan } from "../../../lib/session/session-provider";

/**
 * Student Activities workspace: clubs, events, achievements and mentoring
 * share one strip. Each page's tab carries its menu entry's name; the
 * mentoring tab stands for both mentoring pages, so it keeps a name of its own.
 */
export function ActivitiesWorkspaceNav(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const label = useTranslations();
  const workspace = useTranslations("app.workspace");
  const pathname = usePathname();
  const activitiesOn = useModuleEnabled("activities");
  const mentoringOn = useModuleEnabled("mentoring");
  const canView = useCan("view_activities") && activitiesOn;
  // A coach (pembina) reaches the clubs they coach, not events or achievements.
  const canCoach = useCan("record_extracurricular_attendance") && activitiesOn;
  // A guru wali (manage_mentoring) reaches the groups they mentor.
  const canReadMentoring = useCan("view_mentoring");
  const canMentorGroups = useCan("manage_mentoring");
  const canMentor = (canReadMentoring || canMentorGroups) && mentoringOn;
  const inMentoring = pathname === "/mentoring" || pathname.startsWith("/mentoring/");
  return (
    <WorkspaceNav
      label={workspace("studentActivities")}
      items={[
        ...(canView || canCoach
          ? [{ href: "/activities/clubs", label: label(registryLabelKey("activities-clubs")) }]
          : []),
        ...(canView
          ? [
              { href: "/activities/events", label: label(registryLabelKey("activities-events")) },
              {
                href: "/activities/achievements",
                label: label(registryLabelKey("activities-achievements")),
              },
            ]
          : []),
        // Both mentoring URLs stay valid; the sidebar already lands on my-groups first.
        ...(canMentor
          ? [{ href: "/mentoring/my-groups", label: t("mentoringTab"), active: inMentoring }]
          : []),
      ]}
    />
  );
}

/** The visitor book's pages, each tab named as its menu entry and page title. */
export function VisitorsWorkspaceNav(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const label = useTranslations();
  const visitorsOn = useModuleEnabled("visitors");
  const canView = useCan("view_visitors") && visitorsOn;
  const canIncidents = useCan("view_visitor_incidents") && visitorsOn;
  const canReports = useCan("view_visitor_reports") && visitorsOn;
  return (
    <WorkspaceNav
      label={t("visitors")}
      items={[
        ...(canView
          ? [
              { href: "/visitors/board", label: label(registryLabelKey("visitors-board")) },
              { href: "/visitors/expected", label: label(registryLabelKey("visitors-expected")) },
            ]
          : []),
        ...(canIncidents
          ? [{ href: "/visitors/incidents", label: label(registryLabelKey("visitors-incidents")) }]
          : []),
        ...(canReports
          ? [{ href: "/visitors/recap", label: label(registryLabelKey("visitors-recap")) }]
          : []),
      ]}
    />
  );
}

/** Violations and warning letters, each tab named as its menu entry and page title. */
export function DisciplineWorkspaceNav(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const label = useTranslations();
  const disciplineOn = useModuleEnabled("discipline");
  const canView = useCan("view_discipline") && disciplineOn;
  return (
    <WorkspaceNav
      label={t("discipline")}
      items={
        canView
          ? [
              { href: "/discipline/violations", label: label(registryLabelKey("violations")) },
              {
                href: "/discipline/warning-letters",
                label: label(registryLabelKey("warning-letters")),
              },
            ]
          : []
      }
    />
  );
}

/** Early warning and counseling notes, each tab named as its menu entry and page title. */
export function CounselingWorkspaceNav(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const label = useTranslations();
  const disciplineOn = useModuleEnabled("discipline");
  const canCounsel = useCan("manage_counseling") && disciplineOn;
  const canMonitor = useCan("view_early_warning");
  return (
    <WorkspaceNav
      label={t("counseling")}
      items={[
        ...(canMonitor
          ? [{ href: "/analytics", label: label(registryLabelKey("analytics")) }]
          : []),
        ...(canCounsel
          ? [{ href: "/discipline/counseling", label: label(registryLabelKey("counseling")) }]
          : []),
      ]}
    />
  );
}

export function DutyWorkspaceActions(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const canMonitor = useCan("view_monitor_presence");
  const permitsOn = useModuleEnabled("permits");
  return (
    <div className="flex flex-wrap gap-2">
      {permitsOn && (
        <Button asChild variant="secondary" size="sm">
          <Link href="/leave-requests">{t("permits")}</Link>
        </Button>
      )}
      {canMonitor && (
        <Button asChild variant="secondary" size="sm">
          <Link href="/monitor" target="_blank" rel="noopener noreferrer">
            {t("monitor")}
          </Link>
        </Button>
      )}
    </div>
  );
}
