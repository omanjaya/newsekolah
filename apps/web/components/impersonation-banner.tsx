"use client";

import { Alert } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../lib/session/session-provider";

/** Renders nothing outside an impersonation session (docs/08-security.md section 2: "ditandai di UI"). */
export function ImpersonationBanner(): ReactElement | null {
  const { me } = useSession();
  const t = useTranslations("app.shell.impersonation");

  if (!me?.impersonated_by) return null;

  return (
    <div className="px-4 pt-4 md:px-6">
      <Alert
        variant="warning"
        title={t("banner", { name: me.name, adminName: me.impersonated_by.name ?? "admin" })}
      />
    </div>
  );
}
