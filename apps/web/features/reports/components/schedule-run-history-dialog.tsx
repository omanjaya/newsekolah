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
  type BadgeTone,
} from "@newsekolah/ui";
import { History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useReportScheduleRunsQuery } from "../api";

const STATUS_TONE: Record<string, BadgeTone> = {
  success: "success",
  failed: "danger",
  pending: "neutral",
};

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
                meta={run.status === "failed" ? run.error_message : undefined}
                trailing={
                  <Badge tone={STATUS_TONE[run.status] ?? "neutral"} size="sm">
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
