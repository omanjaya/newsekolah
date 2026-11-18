"use client";

import type { Locale } from "@newsekolah/i18n";
import { Progress, type ProgressTone, cn } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties, ReactElement } from "react";

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
 * red from there. Under each line its level's legend: the threshold and
 * the date it was first reached, so the thresholds are said in text as
 * well as drawn, once.
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
  // The legend row is cut into the stretches between thresholds, one track
  // per level ending at its line (plus the stretch past the last one when
  // the total runs beyond it), and each item is right-aligned in its track,
  // so it ends under its own line. An fr track never shrinks below its
  // content, so thresholds close together push their items apart instead of
  // overlapping them.
  const stretches = sorted.map((level, index) =>
    Math.max(0, level.min_points - (sorted[index - 1]?.min_points ?? 0)),
  );
  if (scaleMax > last.min_points) stretches.push(scaleMax - last.min_points);
  const legendColumns = stretches.map((stretch) => `${String(stretch)}fr`).join(" ");

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <Progress
        value={total}
        max={scaleMax}
        tone={tone}
        aria-label={t("label", { points: total })}
        valueLabel={new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-GB").format(total)}
        // Unnamed lines: the legend under them names each level once.
        markers={sorted.map((level) => ({ value: level.min_points }))}
      />
      <ul
        className="grid grid-cols-(--legend-columns)"
        style={{ "--legend-columns": legendColumns } as CSSProperties}
      >
        {sorted.map((level) => {
          const crossed = crossings.find((crossing) => crossing.level === level.level);
          return (
            <li key={level.level} className="flex flex-col pl-2 text-right">
              <span className="text-caption whitespace-nowrap text-fg">
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
