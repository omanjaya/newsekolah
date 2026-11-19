"use client";

import type { Locale } from "@newsekolah/i18n";
import { Alert, Card, EmptyState, SkeletonCards, Stat, StatGrid } from "@newsekolah/ui";
import { ClipboardList } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { formatShortDay } from "../lib/short-date";
import { useLibraryCatalogueSummaryReportQuery } from "../reports-api";

import { ReportBreakdown } from "./report-breakdown";

/** Accreditation-style catalogue summary: counts a school's library accreditation form asks for. */
export function ReportSummaryTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.summary");
  const locale = useLocale() as Locale;
  const { data, isLoading, isError, error, refetch } = useLibraryCatalogueSummaryReportQuery(
    from,
    to,
  );

  if (isLoading) return <SkeletonCards count={3} />;
  if (isError) return <QueryError retry={() => refetch()} error={error} />;
  if (!data) {
    return <EmptyState icon={<ClipboardList aria-hidden="true" />} title={t("emptyTitle")} />;
  }

  const stats: { key: string; value: string | number }[] = [
    { key: "studentsTotal", value: data.students_total },
    { key: "membersTotal", value: data.members_total },
    { key: "additionsInPeriod", value: data.additions_in_period },
    { key: "loansInPeriod", value: data.loans_in_period },
    { key: "activeBorrowers", value: data.active_borrowers },
    { key: "overdueNow", value: data.overdue_now },
    { key: "visitsInPeriod", value: data.visits_in_period },
    {
      key: "fiction",
      value: t("fictionValue", { count: data.fiction_count, total: data.fiction_total }),
    },
    { key: "itemsPerStudent", value: data.items_per_student.toFixed(2) },
    { key: "loansPerStudent", value: data.loans_per_student.toFixed(2) },
    { key: "visitsPerStudent", value: data.visits_per_student.toFixed(2) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <StatGrid className="gap-x-6 gap-y-5 lg:grid-cols-5">
          {stats.map((stat) => (
            <Stat key={stat.key} label={t(`stats.${stat.key}`)} value={stat.value} />
          ))}
        </StatGrid>
      </Card>

      {data.last_stocktake && (
        <Alert
          title={t("lastStocktake", {
            name: data.last_stocktake.name,
            date: formatShortDay(data.last_stocktake.started_on, locale),
          })}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
        <ReportBreakdown
          title={t("byDdc")}
          rows={data.titles_by_ddc.map((row) => ({
            key: row.code,
            name: `${row.code} ${row.name}`,
            count: row.title_count,
          }))}
        />
        <ReportBreakdown
          title={t("byCategory")}
          rows={data.items_by_category.map((row) => ({
            key: row.name,
            name: row.name,
            count: row.count,
          }))}
        />
        <ReportBreakdown
          title={t("byMaterialType")}
          rows={data.items_by_material_type.map((row) => ({
            key: row.name,
            name: row.name,
            count: row.count,
          }))}
        />
      </div>
    </div>
  );
}
