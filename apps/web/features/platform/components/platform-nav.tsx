"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { WorkspaceNav } from "../../../components/workspace-nav";

/**
 * The operator's two pages as one area: the schools and the operator
 * alerts. Both are open to the same permission (platform_superadmin), so
 * a reader who sees one sees both.
 */
export function PlatformNav(): ReactElement | null {
  const t = useTranslations("nav.platform");
  return (
    <WorkspaceNav
      label={t("label")}
      items={[
        { href: "/platform", label: t("items.tenants") },
        { href: "/platform/operator-alerts", label: t("items.operatorAlerts") },
      ]}
    />
  );
}
