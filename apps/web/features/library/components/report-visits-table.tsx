"use client";

import type { Locale } from "@newsekolah/i18n";
import { EmptyState, SkeletonCards, Stat, StatGrid } from "@newsekolah/ui";
import { DoorOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { QueryError } from "../../../components/query-error";
import { formatShortDate } from "../lib/short-date";
import { useLibraryVisitsReportQuery } from "../reports-api";

import { ReportBreakdown } from "./report-breakdown";

/** Visits in the chosen period, broken down per day and per class. */
export function ReportVisitsTable({
  from,
  to,
  emptyAction,
}: {
  from: string;
  to: string;
  /** The empty state's way on, such as stepping back a month. */
  emptyAction?: ReactNode;
}): ReactElement {
  const t = useTranslations("app.library.reports.visits");
  const locale = useLocale() as Locale;
  const { data, isLoading, isError, error, refetch } = useLibraryVisitsReportQuery(from, to);

  if (isLoading) return <SkeletonCards count={2} />;
  if (isError) return <QueryError retry={() => refetch()} error={error} />;
  if (!data || data.total === 0) {
    return (
      <EmptyState
        icon={<DoorOpen aria-hidden="true" />}
        title={t("emptyTitle")}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StatGrid variant="strip" aria-label={t("summaryLabel")}>
        <Stat icon={<DoorOpen />} category="purple" value={data.total} label={t("totalLabel")} />
      </StatGrid>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <ReportBreakdown
          title={t("columns.day")}
          rows={data.per_day.map((row) => ({
            key: row.day,
            name: formatShortDate(row.day, locale),
            count: row.count,
          }))}
        />
        <ReportBreakdown
          title={t("columns.class")}
          rows={data.per_class.map((row) => ({
            key: row.class_name,
            name: row.class_name,
            count: row.count,
          }))}
        />
      </div>
    </div>
  );
}
