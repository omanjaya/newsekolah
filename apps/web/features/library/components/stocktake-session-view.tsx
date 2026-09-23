"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatNumber } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  BarcodeScannerField,
  Button,
  ConfirmDialog,
  PageHeader,
  Skeleton,
  Stat,
  StatGrid,
  useToast,
} from "@newsekolah/ui";
import type { BarcodeScanEvent } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type LibraryStocktakeResult,
  downloadLibraryStocktakeReportXlsx,
  useCloseStocktakeMutation,
  useLibraryStocktakeProgressQuery,
  useLibraryStocktakeQuery,
  useLibraryStocktakeResultsQuery,
  useScanStocktakeMutation,
} from "../stocktake-api";

/** How many barcodes a result list shows before pointing to the XLSX report. */
const BARCODE_PREVIEW_LIMIT = 30;

export function StocktakeSessionView({ stocktakeId }: { stocktakeId: string }): ReactElement {
  const t = useTranslations("app.library.stocktake");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canViewReports = useCan("view_library_reports");
  const session = useLibraryStocktakeQuery(stocktakeId);
  const scan = useScanStocktakeMutation();
  const close = useCloseStocktakeMutation();

  const [scannedCount, setScannedCount] = useState(0);
  const [closedResult, setClosedResult] = useState<LibraryStocktakeResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const isOpen = session.data?.status === "open" && closedResult === null;
  const isClosed = session.data?.status === "closed";

  const progress = useLibraryStocktakeProgressQuery(stocktakeId, isOpen);
  const results = useLibraryStocktakeResultsQuery(stocktakeId, isClosed);
  const result = closedResult ?? (isClosed ? (results.data ?? null) : null);
  const num = (value: number) => formatNumber(value, { locale });

  const errorMessage = (error: unknown) =>
    error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");

  const handleScan = (event: BarcodeScanEvent) => {
    scan.mutate(
      { stocktakeId, barcode: event.code },
      {
        onSuccess: () => {
          setScannedCount((count) => count + 1);
          void progress.refetch();
        },
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      },
    );
  };

  async function handleDownloadReport() {
    setDownloading(true);
    try {
      await downloadLibraryStocktakeReportXlsx(stocktakeId);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        breadcrumb={[{ label: t("title"), href: "/library/stocktake" }]}
        title={session.data?.name ?? ""}
        actions={
          canViewReports ? (
            <Button
              variant="secondary"
              icon={<Download />}
              loading={downloading}
              onClick={() => {
                void handleDownloadReport();
              }}
            >
              {t("downloadReport")}
            </Button>
          ) : undefined
        }
      />

      {session.isLoading && <Skeleton className="h-40 w-full" aria-busy="true" />}

      {isOpen && (
        <>
          <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-fg">{t("progress.heading")}</h2>
            {progress.isLoading ? (
              <Skeleton className="h-16 w-full" aria-busy="true" />
            ) : progress.data ? (
              <StatGrid>
                <Stat label={t("result.expected")} value={num(progress.data.expected_count)} />
                <Stat label={t("result.scanned")} value={num(progress.data.scanned_count)} />
                <Stat label={t("result.missing")} value={num(progress.data.missing_count)} />
                <Stat label={t("result.misplaced")} value={num(progress.data.misplaced_count)} />
              </StatGrid>
            ) : null}
            <p className="text-[12px] text-fg-muted">{t("progress.live")}</p>
          </section>

          <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-fg">{t("scan.heading")}</h2>
            <BarcodeScannerField
              label={t("scan.label")}
              onScan={handleScan}
              placeholder={t("scan.placeholder")}
              submitLabel={t("scan.submit")}
              disabled={scan.isPending}
            />
            <p className="text-[13px] text-fg-muted" aria-live="polite">
              {t("scan.thisDevice", { count: scannedCount })}
            </p>
          </section>

          <Button
            variant="secondary"
            onClick={() => {
              setConfirmingClose(true);
            }}
            className="self-start"
          >
            {t("close")}
          </Button>
        </>
      )}

      {isClosed && results.isLoading && !result && (
        <Skeleton className="h-32 w-full" aria-busy="true" />
      )}

      {result && (
        <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[15px] font-semibold text-fg">{t("result.heading")}</h2>
          <StatGrid>
            <Stat label={t("result.expected")} value={num(result.expected_count)} />
            <Stat label={t("result.scanned")} value={num(result.scanned_count)} />
            <Stat label={t("result.missing")} value={num(result.missing.length)} />
            <Stat label={t("result.unexpected")} value={num(result.unexpected.length)} />
            <Stat label={t("result.misplaced")} value={num(result.misplaced.length)} />
          </StatGrid>
          <BarcodeList
            label={t("result.missing")}
            barcodes={result.missing.map((copy) => copy.barcode)}
          />
          <BarcodeList
            label={t("result.unexpected")}
            barcodes={result.unexpected.map((copy) => copy.barcode)}
          />
          <BarcodeList
            label={t("result.misplaced")}
            barcodes={result.misplaced.map((entry) => entry.copy.barcode)}
          />
        </section>
      )}

      <ConfirmDialog
        open={confirmingClose}
        onOpenChange={setConfirmingClose}
        title={t("closeConfirmTitle")}
        description={t("closeConfirmBody")}
        confirmLabel={t("close")}
        confirming={close.isPending}
        onConfirm={() => {
          close.mutate(
            { stocktakeId },
            {
              onSuccess: (data) => {
                setClosedResult(data);
                setConfirmingClose(false);
              },
              onError: (error) => {
                toast.error(errorMessage(error));
              },
            },
          );
        }}
      />
    </div>
  );
}

/**
 * A reconciliation bucket can hold thousands of barcodes (every copy is
 * "missing" until scanned), so only a preview is rendered; the XLSX report
 * carries the full list.
 */
function BarcodeList({
  label,
  barcodes,
}: {
  label: string;
  barcodes: string[];
}): ReactElement | null {
  const t = useTranslations("app.library.stocktake.result");
  const locale = useLocale() as Locale;
  if (barcodes.length === 0) return null;
  const shown = barcodes.slice(0, BARCODE_PREVIEW_LIMIT);
  const rest = barcodes.length - shown.length;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium text-fg">{label}</h3>
      <ul className="flex flex-wrap gap-1">
        {shown.map((barcode) => (
          <li
            key={barcode}
            className="rounded-xs border border-border bg-bg px-2 py-0.5 font-mono text-[12px] text-fg"
          >
            {barcode}
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="text-[12px] text-fg-muted">
          {t("moreInReport", { count: formatNumber(rest, { locale }) })}
        </p>
      )}
    </div>
  );
}
