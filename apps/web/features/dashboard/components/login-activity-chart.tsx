"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

const HOURS = 24;

function pad(hour: number): string {
  return String(hour).padStart(2, "0");
}

/**
 * Logins summed per hour over the last seven days. Twenty-four bare bars say
 * nothing on their own, so the chart carries a baseline, ticks every six
 * hours, and names its own peak: the question an admin actually has is "when
 * do people sign in", not "how many at 14:00".
 *
 * Bars are neutral rather than accent on purpose. TenantProvider writes the
 * school's accent onto documentElement as one value, so it does not follow
 * the theme: the default navy over the dark surface measures 1.48:1, well
 * under the 3:1 DESIGN.md asks of a graph. fg-muted flips with the theme
 * (6.4:1 light, 6.1:1 dark) and keeps tenant colour off the data.
 */
export function LoginActivityChart({ values }: { values: number[] }): ReactElement {
  const t = useTranslations("app.dashboard.admin");
  const format = useFormatter();
  const hours = Array.from({ length: HOURS }, (_, hour) => values[hour] ?? 0);
  const total = hours.reduce((sum, value) => sum + value, 0);

  if (total === 0) {
    return <p className="text-[13px] text-fg-muted">{t("histogramEmpty")}</p>;
  }

  const max = Math.max(...hours);
  const peakHour = hours.indexOf(max);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-fg-muted">
        {t("loginPeak", { hour: `${pad(peakHour)}:00`, count: format.number(max) })}
      </p>
      <div
        className="flex h-28 items-end gap-px border-b border-border"
        role="img"
        aria-label={t("loginChartLabel", {
          total: format.number(total),
          hour: `${pad(peakHour)}:00`,
          count: format.number(max),
        })}
      >
        {hours.map((value, hour) => (
          <div
            key={hour}
            className="flex h-full flex-1 items-end"
            title={t("loginBarLabel", { hour: `${pad(hour)}:00`, count: format.number(value) })}
          >
            <div
              className="w-full rounded-t-xs bg-fg-muted"
              style={{ height: value === 0 ? "2px" : `${Math.max((value / max) * 100, 4)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-px" aria-hidden="true">
        {hours.map((_, hour) => (
          <span
            key={hour}
            className="flex-1 text-center text-[12px] whitespace-nowrap tabular-nums text-fg-muted"
          >
            {hour % 6 === 0 ? pad(hour) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
