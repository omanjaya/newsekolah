"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatNumber } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  type BarcodeScanEvent,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  IconCircle,
  List,
  ListRow,
  type PageHeaderAction,
  Progress,
  Scanner,
  type ScannerResultValue,
  SkeletonDetail,
  Stat,
  StatGrid,
  useScanFeedback,
  useToast,
} from "@newsekolah/ui";
import {
  BookCheck,
  BookX,
  CircleCheck,
  CircleX,
  Download,
  Lock,
  MapPinned,
  ScanLine,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useFindLibraryCopyByCodeMutation, useLibraryTitleNameMutation } from "../desk-api";
import {
  type LibraryStocktakeResult,
  downloadLibraryStocktakeReportXlsx,
  useCloseStocktakeMutation,
  useLibraryStocktakeProgressQuery,
  useLibraryStocktakeQuery,
  useLibraryStocktakeResultsQuery,
  useScanStocktakeMutation,
} from "../stocktake-api";

import { StocktakeResults } from "./stocktake-results";

/** How many recent scans the on-screen feed keeps: a running receipt, not a full log. */
const SCAN_FEED_LIMIT = 6;

interface ScanFeedEntry {
  key: number;
  barcode: string;
  outcome: "found" | "rejected";
  /** The book's title, once looked up for a copy that was found. */
  title?: string;
}

/**
 * One stocktake session (docs/07-ui-ux.md "Scanner"). While it runs: the
 * progress against the expected count as a meter and a strip of figures,
 * then the shared Scanner (camera first, a hardware scanner from anywhere,
 * typing as the fallback) with the last result large and announced and
 * the scans before it by book title. Once closed: the reconciliation.
 * Closing (which asks first) and the XLSX report are header actions.
 */
export function StocktakeSessionView({ stocktakeId }: { stocktakeId: string }): ReactElement {
  const t = useTranslations("app.library.stocktake");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canViewReports = useCan("view_library_reports");
  const session = useLibraryStocktakeQuery(stocktakeId);
  const scan = useScanStocktakeMutation();
  const close = useCloseStocktakeMutation();
  const findCopy = useFindLibraryCopyByCodeMutation();
  const titleName = useLibraryTitleNameMutation();
  const feedback = useScanFeedback();
  const feedCount = useRef(0);

  const [scannedCount, setScannedCount] = useState(0);
  const [scanFeed, setScanFeed] = useState<ScanFeedEntry[]>([]);
  const [closedResult, setClosedResult] = useState<LibraryStocktakeResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const isOpen = session.data?.status === "open" && closedResult === null;
  const closedOnServer = session.data?.status === "closed";

  const progress = useLibraryStocktakeProgressQuery(stocktakeId, isOpen);
  const results = useLibraryStocktakeResultsQuery(stocktakeId, closedOnServer);
  const result = closedResult ?? (closedOnServer ? (results.data ?? null) : null);
  const num = (value: number) => formatNumber(value, { locale });

  const errorMessage = (error: unknown) =>
    error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");

  // Names a found copy by its book after the fact: the scan itself only
  // says whether the code belongs to the collection.
  const nameEntry = (key: number, code: string) => {
    void findCopy
      .mutateAsync(code)
      .then((copy) => titleName.mutateAsync(copy.title_id))
      .then((title) => {
        setScanFeed((feed) =>
          feed.map((entry) => (entry.key === key ? { ...entry, title } : entry)),
        );
      })
      .catch(() => undefined);
  };

  const handleScan = (event: BarcodeScanEvent) => {
    scan.mutate(
      { stocktakeId, barcode: event.code },
      {
        onSuccess: (response) => {
          // The batch endpoint takes one code here, so exactly one scan
          // comes back; a code matching nothing is still HTTP 200 but
          // outcome "rejected" (see scanLibraryStocktake), so success and
          // failure feedback both have to read it, not just the status.
          const outcome = response.data[0]?.outcome ?? "rejected";
          feedCount.current += 1;
          const key = feedCount.current;
          setScanFeed((feed) =>
            [{ key, barcode: event.code, outcome }, ...feed].slice(0, SCAN_FEED_LIMIT),
          );
          if (outcome === "found") {
            feedback.playSuccess();
            setScannedCount((count) => count + 1);
            void progress.refetch();
            nameEntry(key, event.code);
          } else {
            feedback.playError();
          }
        },
        onError: (error) => {
          feedback.playError();
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

  if (session.isLoading) {
    return (
      <AppPage header={false} nav={false}>
        <SkeletonDetail />
      </AppPage>
    );
  }
  if (!session.data) {
    return (
      <AppPage title={t("loadErrorTitle")} nav={false}>
        <QueryError retry={() => session.refetch()} error={session.error} />
      </AppPage>
    );
  }

  const latest = scanFeed[0];
  const lastResult: ScannerResultValue | null = latest
    ? {
        tone: latest.outcome === "found" ? "success" : "danger",
        title:
          latest.outcome === "found" ? (latest.title ?? latest.barcode) : t("scan.recent.rejected"),
        description:
          latest.outcome === "found"
            ? t("scan.foundDetail", { barcode: latest.barcode })
            : latest.barcode,
        key: `${String(latest.key)}:${latest.title ?? ""}`,
      }
    : null;

  const secondaryActions: PageHeaderAction[] = [
    ...(canViewReports
      ? [
          {
            label: downloading ? t("downloading") : t("downloadReport"),
            icon: <Download />,
            disabled: downloading,
            onSelect: () => {
              void handleDownloadReport();
            },
          },
        ]
      : []),
    ...(isOpen
      ? [
          {
            label: t("close"),
            icon: <Lock />,
            onSelect: () => {
              setConfirmingClose(true);
            },
          },
        ]
      : []),
  ];

  return (
    <AppPage title={session.data.name} nav={false} secondaryActions={secondaryActions}>
      {isOpen && (
        <>
          <Card padding="md">
            <CardHeader>
              <CardTitle as="h2">{t("progress.heading")}</CardTitle>
              <CardDescription>{t("progress.live")}</CardDescription>
            </CardHeader>
            {progress.isError ? (
              <QueryError retry={() => progress.refetch()} error={progress.error} />
            ) : (
              <>
                <Progress
                  variant="meter"
                  label={t("progress.meter")}
                  value={progress.data?.scanned_count ?? 0}
                  max={Math.max(progress.data?.expected_count ?? 0, 1)}
                  valueLabel={
                    progress.data
                      ? t("progress.ratio", {
                          scanned: num(progress.data.scanned_count),
                          expected: num(progress.data.expected_count),
                        })
                      : undefined
                  }
                />
                <StatGrid variant="strip" aria-label={t("progress.heading")}>
                  <Stat
                    icon={<BookCheck />}
                    category="blue"
                    value={progress.data ? num(progress.data.expected_count) : "-"}
                    label={t("result.expected")}
                    loading={progress.isLoading}
                  />
                  <Stat
                    icon={<ScanLine />}
                    category="green"
                    value={progress.data ? num(progress.data.scanned_count) : "-"}
                    label={t("result.scanned")}
                    loading={progress.isLoading}
                  />
                  <Stat
                    icon={<BookX />}
                    category="red"
                    value={progress.data ? num(progress.data.missing_count) : "-"}
                    label={t("result.missing")}
                    loading={progress.isLoading}
                  />
                  <Stat
                    icon={<MapPinned />}
                    category="purple"
                    value={progress.data ? num(progress.data.misplaced_count) : "-"}
                    label={t("result.misplaced")}
                    loading={progress.isLoading}
                  />
                </StatGrid>
              </>
            )}
          </Card>

          <Scanner
            variant="action"
            title={t("scan.heading")}
            description={t("scan.thisDevice", { count: scannedCount })}
            onScan={handleScan}
            result={lastResult}
            manualEntry="open"
            manualLabel={t("scan.label")}
            manualPlaceholder={t("scan.placeholder")}
            submitLabel={t("scan.submit")}
            disabled={scan.isPending}
          >
            {scanFeed.length > 1 && <ScanFeedList entries={scanFeed.slice(1)} />}
          </Scanner>
        </>
      )}

      {closedOnServer && results.isError && !closedResult && (
        <QueryError retry={() => results.refetch()} error={results.error} />
      )}
      {closedOnServer && results.isLoading && !result && <SkeletonDetail />}
      {result && <StocktakeResults result={result} />}

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
    </AppPage>
  );
}

/** The scans before the last one, most recent first, each by its book once known. */
function ScanFeedList({ entries }: { entries: ScanFeedEntry[] }): ReactElement {
  const t = useTranslations("app.library.stocktake.scan");
  return (
    <section className="flex flex-col gap-2">
      <CardTitle as="h3" className="text-label text-fg-muted">
        {t("earlier")}
      </CardTitle>
      <List framed dense aria-label={t("earlier")}>
        {entries.map((entry) => {
          const found = entry.outcome === "found";
          return (
            <ListRow
              key={entry.key}
              leading={
                <IconCircle tone={found ? "success" : "danger"} size="sm">
                  {found ? <CircleCheck /> : <CircleX />}
                </IconCircle>
              }
              title={found ? (entry.title ?? entry.barcode) : t("recent.rejected")}
              meta={entry.barcode}
            />
          );
        })}
      </List>
    </section>
  );
}
