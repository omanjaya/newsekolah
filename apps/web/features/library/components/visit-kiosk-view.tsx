"use client";

import { Alert, Button, QrPanel, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { encodeScanPayload } from "../../permits/api";
import { useIssueLibraryKioskTokenMutation } from "../visits-api";

/**
 * Full-screen kiosk (docs/07-ui-ux.md "Kiosk/monitor"): no navigation, a
 * rotating check-in token the visitor's own device scans and submits to
 * `POST /v1/library/visits/kiosk-scan`. The kiosk never scans anything
 * itself; it only displays. The QR uses the shared "sion:" payload so the
 * universal scanner (`/scan`) can tell it is a library check-in.
 */
export function VisitKioskView(): ReactElement {
  const t = useTranslations("app.library.visitKiosk");
  const issue = useIssueLibraryKioskTokenMutation();

  const { mutate, data, isError } = issue;

  useEffect(() => {
    mutate();
  }, [mutate]);

  // The kiosk runs unattended: mint the next token as soon as the current one
  // expires instead of waiting for someone to press "Buat kode baru".
  const expiresAt = data?.expires_at;
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(1000, new Date(expiresAt).getTime() - Date.now());
    const timer = setTimeout(() => {
      mutate();
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [expiresAt, mutate]);

  function renew() {
    mutate();
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-6 text-center">
      <domainIcons.library className="size-10 text-accent" aria-hidden="true" />
      <h1 className="text-[24px] font-medium text-fg">{t("title")}</h1>
      <p className="max-w-md text-[14px] text-fg-muted">{t("instructions")}</p>
      {issue.data ? (
        <QrPanel
          payload={encodeScanPayload("library_visit", "", issue.data.token)}
          code={issue.data.token}
          expiresAt={issue.data.expires_at}
          onRenew={renew}
          renewing={issue.isPending}
          expiredLabel={t("expired")}
          expiresInLabel={(seconds) => t("expiresIn", { seconds })}
          renewLabel={t("renew")}
        />
      ) : isError ? (
        <div className="flex max-w-md flex-col items-center gap-3">
          <Alert variant="warning" title={t("issueFailedTitle")}>
            {t("issueFailedBody")}
          </Alert>
          <Button type="button" variant="secondary" onClick={renew}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <div
          className="h-80 w-80 animate-pulse rounded-sm border border-border bg-surface"
          aria-busy="true"
        />
      )}
    </div>
  );
}
