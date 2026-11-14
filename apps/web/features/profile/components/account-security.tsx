"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { DataList, DataListItem, SkeletonList } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useSession } from "../../../lib/session/session-provider";
import { useSessionsQuery } from "../api";

/**
 * Plain-language security summary (docs/08-security.md section 2): active
 * session count, when the current session started (the closest proxy this
 * API exposes to "last login"), and where a password reset link comes from
 * so a user does not mistake a phished link for the real flow. Meant to sit
 * straight in a Card, under its header.
 */
export function AccountSecurity(): ReactElement {
  const t = useTranslations("app.audit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading, isError, error, refetch } = useSessionsQuery();

  if (isError && !data) {
    return (
      <div className="px-5 pb-5">
        <QueryError retry={() => refetch()} error={error} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="px-5 pb-5">
        <SkeletonList rows={3} leading={false} framed={false} />
      </div>
    );
  }

  const sessions = data.data;
  const current = sessions.find((session) => session.is_current);

  return (
    <DataList>
      <DataListItem label={t("accountSecurity.activeSessions")}>{sessions.length}</DataListItem>
      <DataListItem label={t("accountSecurity.lastLogin")}>
        {current
          ? formatDateTime(current.created_at, { locale, timeZone: me?.tenant.timezone })
          : t("accountSecurity.lastLoginUnknown")}
      </DataListItem>
      <DataListItem label={t("accountSecurity.resetLinkLabel")}>
        {t("accountSecurity.resetLinkBody")}
      </DataListItem>
    </DataList>
  );
}
