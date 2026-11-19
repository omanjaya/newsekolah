"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { registryLabelKey } from "../../../lib/navigation-labels";
import { useSession } from "../../../lib/session/session-provider";
import { SUPERVISION_READ_PERMISSIONS } from "../lib/permissions";

/**
 * A teacher's own results and the cycles, each tab named as its menu entry
 * and page title. The own results need either supervision read permission
 * (a teacher's default is the self-scoped view_own_supervision); the
 * cycles are the school-wide view and need view_supervision.
 */
export function SupervisionWorkspaceNav({ cycleId }: { cycleId?: string }): ReactElement {
  const t = useTranslations("app.workspace");
  const label = useTranslations();
  const { me } = useSession();
  const permissions = me?.permissions ?? [];
  const canViewAll = permissions.includes("view_supervision");
  const canViewOwn = SUPERVISION_READ_PERMISSIONS.some((code) => permissions.includes(code));
  const items = [
    ...(canViewOwn && me?.profile_kind === "teacher"
      ? [
          {
            href: cycleId
              ? `/supervision/my-report?cycle=${encodeURIComponent(cycleId)}`
              : "/supervision/my-report",
            label: label(registryLabelKey("supervision-my-report")),
          },
        ]
      : []),
    ...(canViewAll
      ? [{ href: "/supervision/cycles", label: label(registryLabelKey("supervision-cycles")) }]
      : []),
  ];
  return <WorkspaceNav label={t("supervision")} items={items} />;
}
