"use client";

import { PageHeader, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryDashboardQuery } from "../dashboard-api";

import { DashboardActivityLists } from "./dashboard-activity-lists";
import { DashboardSeriesChart } from "./dashboard-series-chart";

const STAT_KEYS = [
  "titles",
  "copies",
  "available",
  "on_loan",
  "overdue",
  "members",
  "active_members",
  "visits_today",
  "loans_today",
  "returns_today",
  "unpaid_fines_total",
] as const;

/** The library module's landing page: today's counts, recent activity, and a 30-day trend. */
export function LibraryDashboardView(): ReactElement {
  const t = useTranslations("app.library.dashboard");
  const { data, isLoading } = useLibraryDashboardQuery();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      {isLoading || !data ? (
        <Skeleton className="h-32 w-full" aria-busy="true" />
      ) : (
        <dl className="grid grid-cols-2 gap-4 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4 lg:grid-cols-6">
          {STAT_KEYS.map((key) => (
            <div key={key} className="flex flex-col">
              <dt className="text-[12px] text-fg-muted">{t(`stats.${key}`)}</dt>
              <dd className="text-[20px] font-medium tabular-nums text-fg">
                {key === "unpaid_fines_total"
                  ? t("currency", { amount: data.summary[key] })
                  : data.summary[key]}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!isLoading && data && (
        <>
          <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-fg">{t("seriesTitle")}</h2>
            <DashboardSeriesChart series={data.series} />
          </div>

          <DashboardActivityLists
            latestLoans={data.latest_loans}
            longestOverdue={data.longest_overdue}
            popularTitles={data.popular_titles}
          />
        </>
      )}
    </div>
  );
}
