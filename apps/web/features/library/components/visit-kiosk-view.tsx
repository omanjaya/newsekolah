"use client";

import { Alert, Button, QrPanel, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { encodeScanPayload } from "../../permits/api";
import { useIssueLibraryKioskTokenMutation } from "../visits-api";

const MIN_RENEW_DELAY_MS = 5000;
const RETRY_DELAYS_MS = [5000, 10_000, 30_000];

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
  // The mutation clears `data` while a renewal is pending or has failed; keep
  // the last token so the QR stays on screen until the next one arrives.
  const [token, setToken] = useState<NonNullable<typeof data> | null>(null);
  const failures = useRef(0);

  useEffect(() => {
    mutate();
  }, [mutate]);

  if (data && data !== token) setToken(data);
  useEffect(() => {
    if (data) failures.current = 0;
  }, [data]);

  // The kiosk runs unattended: mint the next token as soon as the current one
  // expires instead of waiting for someone to press "Buat kode baru". The
  // floor keeps a skewed device clock from minting once per second.
  const expiresAt = token?.expires_at;
  useEffect(() => {
    if (!expiresAt || isError) return;
    const delay = Math.max(MIN_RENEW_DELAY_MS, new Date(expiresAt).getTime() - Date.now());
    const timer = setTimeout(() => {
      mutate();
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [expiresAt, isError, mutate]);

  // A failed mint (network blip, API restart) retries with a capped backoff so
  // an unattended screen recovers without anyone pressing the button.
  useEffect(() => {
    if (!isError) return;
    const delay = RETRY_DELAYS_MS[Math.min(failures.current, RETRY_DELAYS_MS.length - 1)];
    failures.current += 1;
    const timer = setTimeout(() => {
      mutate();
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [isError, mutate]);

  function renew() {
    mutate();
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 p-6 text-center">
      <domainIcons.library className="size-10 text-accent" aria-hidden="true" />
      <h1 className="text-[24px] font-medium text-fg">{t("title")}</h1>
      <p className="max-w-md text-[14px] text-fg-muted">{t("instructions")}</p>
      {token ? (
        <QrPanel
          payload={encodeScanPayload("library_visit", "", token.token)}
          code={token.token}
          expiresAt={token.expires_at}
          onRenew={renew}
          renewing={issue.isPending}
          expiredLabel={t("expired")}
          expiresInLabel={(seconds) => t("expiresIn", { seconds })}
          renewLabel={t("renew")}
        />
      ) : null}
      {isError ? (
        <div className="flex max-w-md flex-col items-center gap-3">
          <Alert variant="warning" title={t("issueFailedTitle")}>
            {t("issueFailedBody")}
          </Alert>
          <Button type="button" variant="secondary" onClick={renew}>
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {!token && !isError ? (
        <div
          className="h-80 w-80 animate-pulse rounded-sm border border-border bg-surface"
          aria-busy="true"
        />
      ) : null}
    </div>
  );
}
