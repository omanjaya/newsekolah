"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { registryLabelKey } from "../../../lib/navigation-labels";
import { useSession } from "../../../lib/session/session-provider";

/** A teacher's own results and the cycles, each tab named as its menu entry and page title. */
export function SupervisionWorkspaceNav({ cycleId }: { cycleId?: string }): ReactElement {
  const t = useTranslations("app.workspace");
  const label = useTranslations();
  const { me } = useSession();
  const canView = me?.permissions.includes("view_supervision") ?? false;
  const items = canView
    ? [
        ...(me?.profile_kind === "teacher"
          ? [
              {
                href: cycleId
                  ? `/supervision/my-report?cycle=${encodeURIComponent(cycleId)}`
                  : "/supervision/my-report",
                label: label(registryLabelKey("supervision-my-report")),
              },
            ]
          : []),
        { href: "/supervision/cycles", label: label(registryLabelKey("supervision-cycles")) },
      ]
    : [];
  return <WorkspaceNav label={t("supervision")} items={items} />;
}
