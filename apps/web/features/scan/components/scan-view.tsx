"use client";

import { Alert, BarcodeScannerField, Card, PageHeader, useScanFeedback } from "@newsekolah/ui";
import type { BarcodeScanEvent } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { type ScanOutcome, useScanDispatch } from "./use-scan-dispatch";

const MAX_HISTORY = 20;

/**
 * The one scanner for everyone (docs/07-ui-ux.md "Scanner"): classroom
 * entry, late arrival, exit-permit stage, gate exit and library check-in
 * all arrive here as a QR and are routed by its payload kind
 * (`resolveScanRoute`). The scanner stays mounted after each scan, and its
 * camera stays open (`continuous`) so a gate or classroom can scan many
 * students in a row, with the latest result shown under the camera and on
 * top of a short session-local history. Camera, hardware scanner and
 * manual entry come from the shared `BarcodeScannerField`.
 */
export function ScanView(): ReactElement {
  const t = useTranslations("app.scan");
  const dispatch = useScanDispatch();
  const feedback = useScanFeedback();
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ScanOutcome[]>([]);

  async function handleScan(event: BarcodeScanEvent): Promise<boolean> {
    setBusy(true);
    const outcome = await dispatch(event.code);
    setBusy(false);
    if (outcome.ok) feedback.playSuccess();
    else feedback.playError();
    setHistory((prev) => [outcome, ...prev].slice(0, MAX_HISTORY));
    return outcome.ok;
  }

  const [latest, ...earlier] = history;
  const latestAlert = latest && (
    <Alert
      variant={latest.ok ? "info" : "warning"}
      title={latest.ok ? t("successTitle") : t("errorTitle")}
    >
      {latest.message}
    </Alert>
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="max-w-2xl text-[13px] text-fg-muted">{t("intro")}</p>
      <div className="flex max-w-xl flex-col gap-4">
        <BarcodeScannerField
          label={t("scanLabel")}
          placeholder={t("placeholder")}
          submitLabel={t("submit")}
          cameraLabel={t("cameraLabel")}
          onScan={handleScan}
          continuous
          doneLabel={t("cameraDone")}
          cameraFooter={latestAlert}
          disabled={busy}
          stretch
          size="large"
        />
        <div aria-live="polite" className="flex flex-col gap-3">
          {latestAlert}
          {earlier.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-[13px] font-medium text-fg">{t("historyTitle")}</h2>
              <ul className="flex flex-col gap-1.5">
                {earlier.map((entry) => (
                  <li key={entry.key}>
                    <Card className="px-3 py-2 text-[13px]">
                      <span className="font-medium">
                        {entry.ok ? t("successTitle") : t("errorTitle")}
                      </span>
                      <span className="text-fg-muted"> - {entry.message}</span>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
