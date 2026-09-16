"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Skeleton } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryCatalogueSummaryReportQuery } from "../reports-api";

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; count: number }[];
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-medium text-fg">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-fg-muted">-</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.name} className="flex items-center justify-between text-[13px]">
              <span className="text-fg">{row.name}</span>
              <span className="tabular-nums text-fg-muted">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Accreditation-style catalogue summary: counts a school's library accreditation form asks for. */
export function ReportSummaryTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.summary");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useLibraryCatalogueSummaryReportQuery(from, to);

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  if (!data) return <p className="text-[13px] text-fg-muted">{t("emptyTitle")}</p>;

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
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.key} className="flex flex-col">
            <dt className="text-[12px] text-fg-muted">{t(`stats.${stat.key}`)}</dt>
            <dd className="text-[18px] font-medium tabular-nums text-fg">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {data.last_stocktake && (
        <p className="text-[13px] text-fg-muted">
          {t("lastStocktake", {
            name: data.last_stocktake.name,
            date: formatDate(data.last_stocktake.started_on, { locale }),
          })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <BreakdownTable
          title={t("byDdc")}
          rows={data.titles_by_ddc.map((row) => ({
            name: `${row.code} ${row.name}`,
            count: row.title_count,
          }))}
        />
        <BreakdownTable
          title={t("byCategory")}
          rows={data.items_by_category.map((row) => ({ name: row.name, count: row.count }))}
        />
        <BreakdownTable
          title={t("byMaterialType")}
          rows={data.items_by_material_type.map((row) => ({ name: row.name, count: row.count }))}
        />
      </div>
    </div>
  );
}
