"use client";

import { Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryMembersReportQuery } from "../reports-api";

/** Members counted by type and by class, plus the active/total split. */
export function ReportMembersTable(): ReactElement {
  const t = useTranslations("app.library.reports.members");
  const { data, isLoading } = useLibraryMembersReportQuery();

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  if (!data || data.total === 0) {
    return <p className="text-[13px] text-fg-muted">{t("emptyTitle")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col">
          <dt className="text-[12px] text-fg-muted">{t("total")}</dt>
          <dd className="text-[18px] font-medium tabular-nums text-fg">{data.total}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-[12px] text-fg-muted">{t("active")}</dt>
          <dd className="text-[18px] font-medium tabular-nums text-fg">{data.active}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="overflow-x-auto rounded-sm border border-border bg-surface">
          <table className="w-full min-w-[280px] text-[13px]">
            <thead>
              <tr className="bg-bg text-left text-fg-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.type")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.count")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.per_type.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-fg">{row.name}</td>
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
