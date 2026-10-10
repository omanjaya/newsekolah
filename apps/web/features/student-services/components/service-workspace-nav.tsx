"use client";

import { Button } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { useCan } from "../../../lib/session/session-provider";

/** Student Activities workspace: clubs, events, achievements and mentoring share one strip. */
export function ActivitiesWorkspaceNav(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const workspace = useTranslations("app.workspace");
  const pathname = usePathname();
  const canView = useCan("view_activities");
  const canMentor = useCan("view_mentoring");
  const inMentoring = pathname === "/mentoring" || pathname.startsWith("/mentoring/");
  return (
    <WorkspaceNav
      label={workspace("studentActivities")}
      items={[
        ...(canView
          ? [
              { href: "/activities/clubs", label: t("clubsTab") },
              { href: "/activities/events", label: t("eventsTab") },
              { href: "/activities/achievements", label: t("achievementsTab") },
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

export function VisitorsWorkspaceNav(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const canView = useCan("view_visitors");
  const canIncidents = useCan("view_visitor_incidents");
  const canReports = useCan("view_visitor_reports");
  return (
    <WorkspaceNav
      label={t("visitors")}
      items={[
        ...(canView
          ? [
              { href: "/visitors/board", label: t("today") },
              { href: "/visitors/expected", label: t("expected") },
            ]
          : []),
        ...(canIncidents ? [{ href: "/visitors/incidents", label: t("incidents") }] : []),
        ...(canReports ? [{ href: "/visitors/recap", label: t("recap") }] : []),
      ]}
    />
  );
}

export function DisciplineWorkspaceNav(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const canView = useCan("view_discipline");
  return (
    <WorkspaceNav
      label={t("discipline")}
      items={
        canView
          ? [
              { href: "/discipline/violations", label: t("cases") },
              { href: "/discipline/warning-letters", label: t("letters") },
            ]
          : []
      }
    />
  );
}

export function CounselingWorkspaceNav(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const canCounsel = useCan("manage_counseling");
  const canMonitor = useCan("view_early_warning");
  return (
    <WorkspaceNav
      label={t("counseling")}
      items={[
        ...(canMonitor ? [{ href: "/analytics", label: t("monitoring") }] : []),
        ...(canCounsel ? [{ href: "/discipline/counseling", label: t("sessions") }] : []),
      ]}
    />
  );
}

export function DutyWorkspaceActions(): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const canMonitor = useCan("view_monitor_presence");
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="secondary" size="sm">
        <Link href="/leave-requests">{t("permits")}</Link>
      </Button>
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
