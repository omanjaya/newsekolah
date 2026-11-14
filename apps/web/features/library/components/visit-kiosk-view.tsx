"use client";

import { Alert, Button, HeroCard, IconCircle, QrPanel, QrPanelSkeleton } from "@newsekolah/ui";
import { CheckCircle2, RotateCw, ScanLine, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { encodeScanPayload } from "../../permits/api";
import { useIssueLibraryKioskTokenMutation } from "../visits-api";

const MIN_RENEW_DELAY_MS = 5000;
const RETRY_DELAYS_MS = [5000, 10_000, 30_000];

/**
 * The visit check-in screen, inside the kiosk frame (no app shell): a
 * soft accent card says what to do in three steps, beside a large QR the
 * visitor's own device scans and submits to
 * `POST /v1/library/visits/kiosk-scan`. The kiosk never scans anything
 * itself. The token renews itself when it expires and retries with a
 * capped backoff after a failure, so an unattended screen never sits on a
 * dead code; the QR uses the shared "sion:" payload so the universal
 * scanner (`/scan`) can tell it is a library check-in.
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

  // Mint the next token as soon as the current one expires instead of
  // waiting for someone to press "Buat kode baru". The floor keeps a skewed
  // device clock from minting once per second.
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

  const steps = [
    { key: "open", icon: <Smartphone /> },
    { key: "scan", icon: <ScanLine /> },
    { key: "done", icon: <CheckCircle2 /> },
  ] as const;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-8 md:py-10">
      <div className="grid w-full max-w-6xl items-center gap-6 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <HeroCard eyebrow={t("eyebrow")} title={t("title")} meta={t("instructions")} titleAs="h1">
          <ol className="mt-4 flex flex-col gap-4">
            {steps.map((step, index) => (
              <li key={step.key} className="flex items-center gap-4">
                <IconCircle tone="accent" size="lg">
                  {step.icon}
                </IconCircle>
                <span className="flex flex-col">
                  <span className="text-caption text-accent-soft-fg/80">
                    {t("stepNumber", { number: index + 1 })}
                  </span>
                  <span className="text-heading">{t(`steps.${step.key}`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </HeroCard>

        <div className="flex flex-col items-center gap-4">
          {token ? (
            <QrPanel
              size="lg"
              label={t("qrLabel")}
              payload={encodeScanPayload("library_visit", "", token.token)}
              code=""
              expiresAt={token.expires_at}
              onRenew={renew}
              renewing={issue.isPending}
              expiredLabel={t("expired")}
              expiresInLabel={(seconds) => t("expiresIn", { seconds })}
              renewLabel={t("renew")}
              className="w-full"
            />
          ) : isError ? null : (
            <QrPanelSkeleton size="lg" className="w-full" />
          )}
          {isError && (
            <Alert
              tone="danger"
              title={t("issueFailedTitle")}
              className="w-full"
              action={
                <Button size="sm" variant="secondary" icon={<RotateCw />} onClick={renew}>
                  {t("retry")}
                </Button>
              }
            >
              {t("issueFailedBody")}
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
