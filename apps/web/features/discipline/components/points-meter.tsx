"use client";

import type { Locale } from "@newsekolah/i18n";
import { Progress, type ProgressTone, cn } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { SPCrossing, SPLevel } from "../api";

/** The level the total reaches next, or none once every threshold is behind it. */
export function nextLevel(total: number, levels: readonly SPLevel[]): SPLevel | undefined {
  return [...levels].sort((a, b) => a.min_points - b.min_points).find((l) => total < l.min_points);
}

function shortDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

/**
 * A student's points against the school's warning-letter thresholds: one
 * shared meter from zero to the last level, each level (SP 1, SP 2, SP 3)
 * a marked line on it, the fill amber until the last level is reached and
 * red from there. Under it, each level's threshold and the date it was
 * first reached, so the thresholds are said in text as well as drawn.
 */
export function PointsMeter({
  total,
  levels,
  crossings = [],
  className,
}: {
  total: number;
  levels: readonly SPLevel[];
  crossings?: readonly SPCrossing[];
  className?: string;
}): ReactElement | null {
  const t = useTranslations("app.discipline.pointsMeter");
  const locale = useLocale() as Locale;
  const sorted = [...levels].sort((a, b) => a.min_points - b.min_points);
  const last = sorted.at(-1);
  if (!last) return null;

  // The scale ends at the last threshold, or at the total once it is past it.
  const scaleMax = Math.max(1, last.min_points, total);
  const tone: ProgressTone = total >= last.min_points ? "danger" : "warning";

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <Progress
        value={total}
        max={scaleMax}
        tone={tone}
        aria-label={t("label", { points: total })}
        valueLabel={new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-GB").format(total)}
        markers={sorted.map((level) => ({ value: level.min_points, label: level.label }))}
      />
      <ul className="grid auto-cols-fr grid-flow-col gap-2">
        {sorted.map((level) => {
          const crossed = crossings.find((crossing) => crossing.level === level.level);
          return (
            <li key={level.level} className="flex min-w-0 flex-col">
              <span className="text-caption text-fg">
                {t("threshold", { level: level.label, points: level.min_points })}
              </span>
              <span className="text-caption font-normal text-fg-muted">
                {crossed
                  ? t("reachedOn", { date: shortDate(crossed.occurred_on, locale) })
                  : t("notReached")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
