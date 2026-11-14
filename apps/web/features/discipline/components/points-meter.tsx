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
 * segment per level (SP 1, SP 2, SP 3), each filling as the total moves
 * through it, amber toward red, with the date a level was first reached.
 * The shared Progress meter draws each segment; the row of them is the
 * scale.
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
  if (sorted.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t("label", { points: total })}
      className={cn("grid auto-cols-fr grid-flow-col gap-2", className)}
    >
      {sorted.map((level, index) => {
        const from = index === 0 ? 0 : (sorted[index - 1]?.min_points ?? 0);
        const span = Math.max(1, level.min_points - from);
        const filled = Math.min(span, Math.max(0, total - from));
        const crossed = crossings.find((crossing) => crossing.level === level.level);
        const tone: ProgressTone = index === sorted.length - 1 ? "danger" : "warning";
        return (
          <div key={level.level} className="flex min-w-0 flex-col gap-1.5">
            <Progress
              value={filled}
              max={span}
              tone={tone}
              aria-label={t("segment", { level: level.label, points: level.min_points })}
            />
            <span className="flex flex-col">
              <span className="text-caption text-fg">
                {t("threshold", { level: level.label, points: level.min_points })}
              </span>
              <span className="text-caption font-normal text-fg-muted">
                {crossed
                  ? t("reachedOn", { date: shortDate(crossed.occurred_on, locale) })
                  : t("notReached")}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
