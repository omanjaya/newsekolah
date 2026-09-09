"use client";

import { Badge, Dialog, DialogContent, EmptyState, Skeleton } from "@newsekolah/ui";
import { History } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useReportScheduleRunsQuery } from "../api";

const STATUS_VARIANT: Record<string, "accent" | "neutral"> = {
  success: "accent",
  failed: "neutral",
  pending: "neutral",
};

const FAILED_CLASS = "border-status-absent/30 bg-status-absent/10 text-status-absent";

export function ScheduleRunHistoryDialog({
  scheduleId,
  onClose,
}: {
  scheduleId: string | null;
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("app.reports.schedules.runs");
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
          <Skeleton className="h-40 w-full" aria-busy="true" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<History aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
            {items.map((run) => (
              <li key={run.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-fg">{new Date(run.due_at).toLocaleString()}</span>
                  {run.status === "failed" && run.error_message && (
                    <span className="text-[12px] text-fg-muted">{run.error_message}</span>
                  )}
                </div>
                <Badge
                  variant={STATUS_VARIANT[run.status] ?? "neutral"}
                  className={run.status === "failed" ? FAILED_CLASS : undefined}
                >
                  {t(`status.${run.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
