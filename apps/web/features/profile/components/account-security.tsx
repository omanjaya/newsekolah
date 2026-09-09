"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Skeleton } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useSessionsQuery } from "../api";

/**
 * Plain-language security summary (docs/08-security.md section 2): active
 * session count, when the current session started (the closest proxy this
 * API exposes to "last login"), and where a password reset link comes from
 * so a user does not mistake a phished link for the real flow.
 */
export function AccountSecurity(): ReactElement {
  const t = useTranslations("app.audit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading } = useSessionsQuery();

  if (isLoading || !data) {
    return <Skeleton className="h-24 w-full" />;
  }

  const sessions = data.data;
  const current = sessions.find((session) => session.is_current);

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
      <div>
        <dt className="text-fg-muted">{t("accountSecurity.activeSessions")}</dt>
        <dd className="text-fg">{sessions.length}</dd>
      </div>
      <div>
        <dt className="text-fg-muted">{t("accountSecurity.lastLogin")}</dt>
        <dd className="text-fg">
          {current
            ? formatDateTime(current.created_at, { locale, timeZone: me?.tenant.timezone })
            : t("accountSecurity.lastLoginUnknown")}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-fg-muted">{t("accountSecurity.resetLinkLabel")}</dt>
        <dd className="text-fg">{t("accountSecurity.resetLinkBody")}</dd>
      </div>
    </dl>
  );
}
