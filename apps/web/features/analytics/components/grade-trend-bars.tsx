"use client";

import { cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export interface GradeTrendBarsProps {
  previous: number;
  current: number;
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
export function GradeTrendBars({ previous, current }: GradeTrendBarsProps): ReactElement {
  const t = useTranslations("app.analytics.detail.signals");
  const max = Math.max(previous, current, 1);
  const dropped = current < previous;
  const label = t("gradeTrendValue", {
    previous: previous.toFixed(1),
    current: current.toFixed(1),
  });

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-fg">{label}</p>
      <div role="img" aria-label={label} className="flex flex-col gap-1">
        <GradeBar
          labelText={t("gradeTrendPrevious")}
          value={previous}
          max={max}
          colorClass="bg-fg-muted"
        />
        <GradeBar
          labelText={t("gradeTrendCurrent")}
          value={current}
          max={max}
          colorClass={dropped ? "bg-status-absent" : "bg-status-present"}
        />
      </div>
    </div>
  );
}

function GradeBar({
  labelText,
  value,
  max,
  colorClass,
}: {
  labelText: string;
  value: number;
  max: number;
  colorClass: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[12px] text-fg-muted">{labelText}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-xs bg-bg">
        <div
          className={cn("h-full rounded-xs", colorClass)}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-fg">
        {value.toFixed(1)}
      </span>
    </div>
  );
}
