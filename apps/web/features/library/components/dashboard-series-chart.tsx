"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { EmptyState } from "@newsekolah/ui";
import { ChartColumn } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LibraryDashboard } from "../dashboard-api";
import { formatShortDate } from "../lib/short-date";

type SeriesPoint = LibraryDashboard["series"][number];

/**
 * Loans against returns per day over the trailing 30 days: two bars per
 * day, heights proportional to the real counts, with the first and last
 * day under the axis. Plain elements, so the totals stay readable to a
 * screen reader through the chart's label and each day's title. A month
 * without any circulation says so instead of drawing an empty frame.
 */
export function DashboardSeriesChart({ series }: { series: SeriesPoint[] }): ReactElement {
  const t = useTranslations("app.library.dashboard.series");
  const locale = useLocale() as Locale;

  const max = Math.max(1, ...series.map((point) => Math.max(point.loans, point.returns)));
  const totalLoans = series.reduce((sum, point) => sum + point.loans, 0);
  const totalReturns = series.reduce((sum, point) => sum + point.returns, 0);
  const first = series[0];
  const last = series.at(-1);

  if (totalLoans + totalReturns === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={<ChartColumn aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
          {t("loans", { count: totalLoans })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-fg-muted/50" aria-hidden="true" />
          {t("returns", { count: totalReturns })}
        </span>
      </div>
      <div
        role="img"
        aria-label={t("chartLabel", { loans: totalLoans, returns: totalReturns })}
        className="flex h-36 items-end gap-1 border-b border-line"
      >
        {series.map((point) => (
          <div
            key={point.day}
            className="flex h-full min-w-0 flex-1 items-end gap-px"
            title={t("dayTooltip", {
              day: formatDate(point.day, { locale }),
              loans: point.loans,
              returns: point.returns,
            })}
          >
            <div
              className="flex-1 rounded-t-xs bg-accent"
              style={{ height: `${(point.loans / max) * 100}%` }}
            />
            <div
              className="flex-1 rounded-t-xs bg-fg-muted/50"
              style={{ height: `${(point.returns / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      {first && last && (
        <div className="flex justify-between text-caption text-fg-muted" aria-hidden="true">
          <span>{formatShortDate(first.day, locale)}</span>
          <span>{formatShortDate(last.day, locale)}</span>
        </div>
      )}
    </div>
  );
}
