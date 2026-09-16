"use client";

import { QrPanel, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { useIssueLibraryKioskTokenMutation } from "../visits-api";

/**
 * Full-screen kiosk (docs/07-ui-ux.md "Kiosk/monitor"): no navigation, a
 * rotating check-in token the visitor's own device scans and submits to
 * `POST /v1/library/visits/kiosk-scan`. The kiosk never scans anything
 * itself; it only displays.
 */
export function VisitKioskView(): ReactElement {
  const t = useTranslations("app.library.visitKiosk");
  const issue = useIssueLibraryKioskTokenMutation();

  useEffect(() => {
    issue.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mint once on mount
  }, []);

  function renew() {
    issue.mutate();
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-6 text-center">
      <domainIcons.library className="size-10 text-accent" aria-hidden="true" />
      <h1 className="text-[24px] font-medium text-fg">{t("title")}</h1>
      <p className="max-w-md text-[14px] text-fg-muted">{t("instructions")}</p>
      {issue.data ? (
        <QrPanel
          payload={issue.data.token}
          code={issue.data.token}
          expiresAt={issue.data.expires_at}
          onRenew={renew}
          renewing={issue.isPending}
          expiredLabel={t("expired")}
          expiresInLabel={(seconds) => t("expiresIn", { seconds })}
          renewLabel={t("renew")}
        />
      ) : (
        <div
          className="h-80 w-80 animate-pulse rounded-sm border border-border bg-surface"
          aria-busy="true"
        />
      )}
    </div>
  );
}
