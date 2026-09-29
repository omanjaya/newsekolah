"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { useSession } from "../../../lib/session/session-provider";

export function StaffAttendanceWorkspaceNav(): ReactElement {
  const t = useTranslations("app.workspace");
  const { me } = useSession();
  const employee = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const items = [
    ...(employee ? [{ href: "/check-in", label: t("myAttendanceStaff") }] : []),
    ...(me?.permissions.includes("view_staff_attendance")
      ? [{ href: "/staff-attendance", label: t("allEmployees") }]
      : []),
  ];
  return <WorkspaceNav label={t("staffAttendance")} items={items} />;
}
