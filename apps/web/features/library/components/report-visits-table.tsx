"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Skeleton } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryVisitsReportQuery } from "../reports-api";

/** Visits in the chosen period, broken down per day and per class. */
export function ReportVisitsTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.visits");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useLibraryVisitsReportQuery(from, to);

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  if (!data || data.total === 0) {
    return <p className="text-[13px] text-fg-muted">{t("emptyTitle")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-fg-muted">{t("total", { count: data.total })}</p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="overflow-x-auto rounded-sm border border-border bg-surface">
          <table className="w-full min-w-[280px] text-[13px]">
            <thead>
              <tr className="bg-bg text-left text-fg-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.day")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.count")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.per_day.map((row) => (
                <tr key={row.day}>
                  <td className="px-3 py-2 text-fg">{formatDate(row.day, { locale })}</td>
                  <td className="px-3 py-2 tabular-nums text-fg-muted">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-sm border border-border bg-surface">
          <table className="w-full min-w-[280px] text-[13px]">
            <thead>
              <tr className="bg-bg text-left text-fg-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.class")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.count")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.per_class.map((row) => (
                <tr key={row.class_name}>
                  <td className="px-3 py-2 text-fg">{row.class_name}</td>
                  <td className="px-3 py-2 tabular-nums text-fg-muted">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
