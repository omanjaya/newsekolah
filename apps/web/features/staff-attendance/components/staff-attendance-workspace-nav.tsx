"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { registryLabelKey } from "../../../lib/navigation-labels";
import { useSession } from "../../../lib/session/session-provider";

/**
 * An employee's own check-in and the school-wide board, each tab named as
 * its menu entry and page title.
 */
export function StaffAttendanceWorkspaceNav(): ReactElement {
  const t = useTranslations("app.workspace");
  const label = useTranslations();
  const { me } = useSession();
  const employee = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const items = [
    ...(employee ? [{ href: "/check-in", label: label(registryLabelKey("check-in")) }] : []),
    ...(me?.permissions.includes("view_staff_attendance")
      ? [{ href: "/staff-attendance", label: label(registryLabelKey("staff-attendance")) }]
      : []),
  ];
  return <WorkspaceNav label={t("staffAttendance")} items={items} />;
}
