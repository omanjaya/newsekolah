"use client";

import { cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { RiskLevel, StudentRisk } from "../api";

const LEVELS: RiskLevel[] = ["none", "watch", "at_risk"];

const BAR_CLASS: Record<RiskLevel, string> = {
  none: "bg-status-present",
  watch: "bg-status-sick",
  at_risk: "bg-status-absent",
};

/**
 * How the caller's whole roster splits across risk levels, as a small
 * proportion bar above the table -- the list itself already carries every
 * row's level as a badge, this just answers "how many, of how many" at a
 * glance, computed from the same rows already fetched (no extra request).
 * Reuses the exact status tokens RiskLevelBadge uses for each level, so a
 * "watch" segment here and a "watch" badge in the table read as the same
 * color everywhere on the page.
 */
export function RiskLevelSummary({ rows }: { rows: StudentRisk[] }): ReactElement | null {
  const t = useTranslations("app.analytics.list.summary");
  const levelLabel = useTranslations("app.analytics.level");

  if (rows.length === 0) return null;

  const counts: Record<RiskLevel, number> = { none: 0, watch: 0, at_risk: 0 };
  for (const row of rows) counts[row.level] += 1;
  const total = rows.length;

  const ariaLabel = t("chartLabel", {
    total,
    none: counts.none,
    watch: counts.watch,
    at_risk: counts.at_risk,
  });

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
            <span
              className={cn("size-2.5 shrink-0 rounded-xs", BAR_CLASS[level])}
              aria-hidden="true"
            />
            <span>{levelLabel(level)}</span>
            <span className="tabular-nums text-fg">{counts[level]}</span>
          </li>
        ))}
      </ul>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-xs bg-bg"
      >
        {LEVELS.map((level) =>
          counts[level] > 0 ? (
            <div
              key={level}
              className={cn("h-full rounded-xs", BAR_CLASS[level])}
              style={{ width: `${(counts[level] / total) * 100}%` }}
              title={`${levelLabel(level)}: ${counts[level]}`}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
