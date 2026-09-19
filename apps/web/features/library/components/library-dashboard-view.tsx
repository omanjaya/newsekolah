"use client";

import { PageHeader, Skeleton, Stat, StatGrid } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
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
  const { data, isLoading, isError, refetch } = useLibraryDashboardQuery();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      {isError && !data ? (
        <QueryError retry={refetch} />
      ) : isLoading || !data ? (
        <Skeleton className="h-32 w-full" aria-busy="true" />
      ) : (
        <StatGrid className="rounded-sm border border-border bg-surface p-4 lg:grid-cols-6">
          {STAT_KEYS.map((key) => (
            <Stat
              key={key}
              label={t(`stats.${key}`)}
              value={
                key === "unpaid_fines_total"
                  ? t("currency", { amount: data.summary[key] })
                  : data.summary[key]
              }
            />
          ))}
        </StatGrid>
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
