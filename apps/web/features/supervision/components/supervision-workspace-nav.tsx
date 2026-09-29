"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";
import { useSession } from "../../../lib/session/session-provider";

export function SupervisionWorkspaceNav({ cycleId }: { cycleId?: string }): ReactElement {
  const t = useTranslations("app.workspace");
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
                label: t("mySupervision"),
              },
            ]
          : []),
        { href: "/supervision/cycles", label: t("cycles") },
      ]
    : [];
  return <WorkspaceNav label={t("supervision")} items={items} />;
}
