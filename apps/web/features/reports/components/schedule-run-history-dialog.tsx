"use client";

import { formatDateTime, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Dialog,
  DialogContent,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
  deliveryStatusTone,
} from "@newsekolah/ui";
import { History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useSession } from "../../../lib/session/session-provider";
import { type ReportScheduleRun, useReportScheduleRunsQuery } from "../api";

/**
 * Why a failed run failed, in the reader's language. The run's
 * error_message is the API's technical detail in English, kept for support
 * and never shown here.
 */
function failureKey(run: ReportScheduleRun): string {
  return `failure.${run.failure_code ?? "unknown"}`;
}

/** The last runs of one schedule: when each was due and how it ended. */
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
  const items = runs.data?.data ?? [];

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
                title={formatDateTime(run.due_at, { locale, timeZone })}
                meta={run.status === "failed" ? t(failureKey(run)) : undefined}
                trailing={
                  <Badge tone={deliveryStatusTone(run.status)} size="sm">
                    {t(`status.${run.status}`)}
                  </Badge>
                }
              />
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
