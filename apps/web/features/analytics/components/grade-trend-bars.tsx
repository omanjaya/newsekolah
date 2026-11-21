"use client";

import type { Locale } from "@newsekolah/i18n";
import { cn } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatScore } from "../../grading/lib/format-score";

export interface GradeTrendBarsProps {
  previous: number;
  current: number;
  /** The grading scale's round_decimal (RiskSignals.score_decimals). */
  decimals?: number;
}

/**
 * The report-score average, before and after: `RiskSignals` only ever
 * carries this one term-over-term pair (there is no intermediate
 * history), so this renders exactly that -- two bars, not a fabricated
 * multi-point trend line -- scaled to each other (not an assumed 0-100
 * ceiling, since a tenant's grading scale is configurable,
 * grading/domain.Scale) and colored by whether the average held or
 * dropped, matching the reasons this signal actually triggers on.
 */
export function GradeTrendBars({ previous, current, decimals }: GradeTrendBarsProps): ReactElement {
  const t = useTranslations("app.analytics.detail.signals");
  const locale = useLocale() as Locale;
  const format = (value: number) => formatScore(value, locale, decimals);
  const max = Math.max(previous, current, 1);
  const dropped = current < previous;
  const label = t("gradeTrendValue", {
    previous: format(previous),
    current: format(current),
  });

  // Under the signal's figure (student-risk-panel.tsx), which states the
  // averages; the sentence is the bars' accessible name.
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-1">
      <GradeBar
        labelText={t("gradeTrendPrevious")}
        value={previous}
        valueText={format(previous)}
        max={max}
        colorClass="bg-fg-muted"
      />
      <GradeBar
        labelText={t("gradeTrendCurrent")}
        value={current}
        valueText={format(current)}
        max={max}
        colorClass={dropped ? "bg-danger" : "bg-success"}
      />
    </div>
  );
}

function GradeBar({
  labelText,
  value,
  valueText,
  max,
  colorClass,
}: {
  labelText: string;
  value: number;
  valueText: string;
  max: number;
  colorClass: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-caption text-fg-muted">{labelText}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn("h-full rounded-full", colorClass)}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-caption tabular-nums text-fg">
        {valueText}
      </span>
    </div>
  );
}
