"use client";

import { ApiError } from "@newsekolah/api-client";
import { BarcodeScannerField, useToast } from "@newsekolah/ui";
import type { BarcodeScanEvent } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiClient } from "../../../lib/api/client";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useReturnLoanByBarcodeMutation } from "../desk-api";

interface ReturnedEntry {
  barcode: string;
  title: string;
  fineAmount: number;
}

const MAX_HISTORY = 5;

/** Returns a copy by scanning its barcode, so a return is a scan rather than a loan id lookup. */
export function DeskReturnPanel(): ReactElement {
  const t = useTranslations("app.library.desk.return");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const client = useApiClient();

  const [history, setHistory] = useState<ReturnedEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const returnByBarcode = useReturnLoanByBarcodeMutation();

  async function handleScan(event: BarcodeScanEvent) {
    setScanning(true);
    try {
      const loan = await returnByBarcode.mutateAsync({ barcode: event.code });
      let title = event.code;
      try {
        const titleResponse = await client.GET("/v1/library/titles/{titleId}", {
          params: { path: { titleId: loan.title_id } },
        });
        title = titleResponse.title;
      } catch {
        // Title lookup failing does not undo the return; the barcode still shows.
      }
      setHistory((prev) =>
        [{ barcode: event.code, title, fineAmount: loan.fine_amount }, ...prev].slice(
          0,
          MAX_HISTORY,
        ),
      );
      toast.success(t("success", { title }));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[15px] font-semibold text-fg">{t("heading")}</h2>
      <BarcodeScannerField
        label={t("scanLabel")}
        onScan={(event) => void handleScan(event)}
        submitLabel={t("scanSubmit")}
        disabled={scanning}
      />
      {history.length > 0 && (
        <ul className="flex flex-col gap-2">
          {history.map((entry, index) => (
            <li
              key={`${entry.barcode}-${index}`}
              className="flex items-center justify-between rounded-xs border border-border px-3 py-2 text-[13px]"
            >
              <span className="text-fg">
                {entry.title} <span className="text-fg-muted">({entry.barcode})</span>
              </span>
              {entry.fineAmount > 0 && (
                <span className="text-status-late">{t("fine", { amount: entry.fineAmount })}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
