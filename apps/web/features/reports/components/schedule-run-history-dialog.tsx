"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  List,
  ListRow,
  SkeletonList,
  deliveryStatusTone,
  useToast,
} from "@newsekolah/ui";
import { Download, History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type ReportScheduleRun,
  useReportScheduleRunDownloadMutation,
  useReportScheduleRunsQuery,
} from "../api";

/**
 * Why a failed run failed, in the reader's language. The run's
 * error_message is the API's technical detail in English, kept for support
 * and never shown here.
 */
function failureKey(run: ReportScheduleRun): string {
  return `failure.${run.failure_code ?? "unknown"}`;
}

/**
 * The last runs of one schedule: the slot each was due for, when it
 * actually ran (or that it is still waiting), how it ended, and, for a run
 * that stored its file, a download so a failed email does not lose the
 * report.
 */
export function ScheduleRunHistoryDialog({
  scheduleId,
  onClose,
}: {
  scheduleId: string | null;
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("app.reports.schedules.runs");
  const locale = useLocale() as Locale;
  const timeZone = useSession().me?.tenant.timezone;
  const runs = useReportScheduleRunsQuery(scheduleId);
  const download = useReportScheduleRunDownloadMutation();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const items = runs.data?.data ?? [];

  function downloadRun(run: ReportScheduleRun) {
    download.mutate(
      { scheduleId: run.schedule_id, runId: run.id },
      {
        onSuccess: (result) => {
          window.open(result.url, "_blank", "noopener,noreferrer");
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  function runMeta(run: ReportScheduleRun): string[] {
    const ran = run.ran_at
      ? t("ranAt", { time: formatDateTime(run.ran_at, { locale, timeZone }) })
      : t("notRunYet");
    return run.status === "failed" ? [ran, t(failureKey(run))] : [ran];
  }

  return (
    <Dialog
      open={scheduleId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={t("title")}>
        {runs.isLoading ? (
          <SkeletonList rows={4} leading={false} framed={false} />
        ) : runs.isError && !runs.data ? (
          <QueryError retry={() => runs.refetch()} error={runs.error} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<History aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <List dense className="max-h-96 overflow-y-auto [--list-inset:0px]">
            {items.map((run) => (
              <ListRow
                key={run.id}
                title={t("dueAt", { time: formatDateTime(run.due_at, { locale, timeZone }) })}
                meta={runMeta(run)}
                keepMetaWhole
                trailing={
                  <Badge tone={deliveryStatusTone(run.status)} size="sm">
                    {t(`status.${run.status}`)}
                  </Badge>
                }
                action={
                  run.object_key ? (
                    <IconButton
                      icon={<Download />}
                      aria-label={t("download")}
                      onClick={() => {
                        downloadRun(run);
                      }}
                    />
                  ) : undefined
                }
              />
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
