"use client";

import {
  IconCircle,
  List,
  ListRow,
  Scanner,
  SectionHeader,
  useScanFeedback,
  type BarcodeScanEvent,
  type ScannerResultValue,
} from "@newsekolah/ui";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useSession } from "../../../lib/session/session-provider";
import { scanOffer, type ScanOffer } from "../lib/dispatch";

import { type ScanOutcome, useScanDispatch } from "./use-scan-dispatch";

const MAX_HISTORY = 20;

const INTRO_KEY: Record<ScanOffer, "intro" | "introPermits" | "introLibrary"> = {
  all: "intro",
  permits: "introPermits",
  library: "introLibrary",
};

/**
 * The one scanner for everyone (docs/07-ui-ux.md "Scanner"): classroom
 * entry, late arrival, exit-permit stage, gate exit and library check-in
 * all arrive here as a QR and are routed by its payload kind
 * (`resolveScanRoute`). The shared Scanner puts the camera first in a
 * framed viewfinder, keeps it reading so a gate or classroom can scan many
 * students in a row, shows the last result large under it, hears a
 * hardware scanner from anywhere on the page, and keeps typing the code as
 * the fallback. Earlier results of this visit stay listed below.
 */
export function ScanView(): ReactElement {
  const t = useTranslations("app.scan");
  const { me } = useSession();
  // The route itself is refused by the shell once neither permits nor
  // library is on (SCAN_SECTIONS); here the intro names only what is left.
  const offer = scanOffer(me?.disabled_modules ?? []);
  const dispatch = useScanDispatch();
  const feedback = useScanFeedback();
  const [history, setHistory] = useState<ScanOutcome[]>([]);

  async function handleScan(event: BarcodeScanEvent): Promise<boolean> {
    const outcome = await dispatch(event.code);
    if (outcome.ok) feedback.playSuccess();
    else feedback.playError();
    setHistory((prev) => [outcome, ...prev].slice(0, MAX_HISTORY));
    return outcome.ok;
  }

  const [latest, ...earlier] = history;
  const result: ScannerResultValue | null = latest
    ? {
        tone: latest.ok ? "success" : "danger",
        title: latest.ok ? t("successTitle") : t("errorTitle"),
        description: latest.message,
        key: latest.key,
      }
    : null;

  return (
    <AppPage variant="narrow" nav={false} description={t(INTRO_KEY[offer])}>
      <Scanner
        variant="action"
        onScan={handleScan}
        result={result}
        manualLabel={t("scanLabel")}
        manualPlaceholder={t("placeholder")}
        submitLabel={t("submit")}
      >
        {earlier.length > 0 && (
          <section className="flex flex-col gap-1" aria-labelledby="scan-history-title">
            <SectionHeader as="h2" titleId="scan-history-title" title={t("historyTitle")} />
            <List dense>
              {earlier.map((entry) => (
                <ListRow
                  key={entry.key}
                  className="[--list-inset:0px]"
                  leading={
                    <IconCircle tone={entry.ok ? "success" : "danger"} size="sm">
                      {entry.ok ? <CircleCheck /> : <CircleAlert />}
                    </IconCircle>
                  }
                  title={entry.ok ? t("successTitle") : t("errorTitle")}
                  meta={entry.message}
                />
              ))}
            </List>
          </section>
        )}
      </Scanner>
    </AppPage>
  );
}
