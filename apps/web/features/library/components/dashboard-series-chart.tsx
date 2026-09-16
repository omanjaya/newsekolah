"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LibraryDashboard } from "../dashboard-api";

type SeriesPoint = LibraryDashboard["series"][number];

/**
 * Loans vs. returns per day over the trailing 30 days: two bars per column,
 * height proportional to the day's real count (never invented). Plain
 * divs, not an SVG or chart library, so the numbers stay screen-reader
 * reachable through each bar's title attribute and the summary caption.
 */
export function DashboardSeriesChart({ series }: { series: SeriesPoint[] }): ReactElement {
  const t = useTranslations("app.library.dashboard.series");
  const locale = useLocale() as Locale;

  const max = Math.max(1, ...series.map((point) => Math.max(point.loans, point.returns)));
  const totalLoans = series.reduce((sum, point) => sum + point.loans, 0);
  const totalReturns = series.reduce((sum, point) => sum + point.returns, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-[12px] text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-xs bg-accent" aria-hidden="true" />
          {t("loans", { count: totalLoans })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-xs bg-fg-muted" aria-hidden="true" />
          {t("returns", { count: totalReturns })}
        </span>
      </div>
      <div
        role="img"
        aria-label={t("chartLabel", { loans: totalLoans, returns: totalReturns })}
        className="flex h-32 items-end gap-1 overflow-x-auto"
      >
        {series.map((point) => (
          <div
            key={point.day}
            className="flex h-full min-w-[10px] flex-1 items-end gap-px"
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
    </div>
  );
}
