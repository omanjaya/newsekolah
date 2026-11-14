"use client";

import { Stat, StatGrid, type StatCategory, cn } from "@newsekolah/ui";
import { CircleCheck, Eye, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import type { RiskLevel, StudentRisk } from "../api";

/** Most urgent first: who to check on today leads the row. */
const LEVELS: RiskLevel[] = ["at_risk", "watch", "none"];

const LEVEL_STYLE: Record<RiskLevel, { category: StatCategory; icon: ReactNode }> = {
  at_risk: { category: "red", icon: <TriangleAlert /> },
  watch: { category: "amber", icon: <Eye /> },
  none: { category: "green", icon: <CircleCheck /> },
};

/**
 * How the reader's roster splits across risk levels, as three tiles that
 * also filter the list: tapping "Berisiko" shows only those students,
 * tapping it again shows everyone. Counted from the rows already fetched.
 */
export function RiskLevelSummary({
  rows,
  selected,
  onSelect,
}: {
  rows: StudentRisk[];
  selected: RiskLevel | "";
  onSelect: (level: RiskLevel | "") => void;
}): ReactElement | null {
  const t = useTranslations("app.analytics.list.summary");
  const levelLabel = useTranslations("app.analytics.level");

  if (rows.length === 0) return null;

  const counts: Record<RiskLevel, number> = { none: 0, watch: 0, at_risk: 0 };
  for (const row of rows) counts[row.level] += 1;

  return (
    <StatGrid variant="tiles" aria-label={t("label")} className="grid-cols-3">
      {LEVELS.map((level) => (
        <Stat
          key={level}
          icon={LEVEL_STYLE[level].icon}
          category={LEVEL_STYLE[level].category}
          value={counts[level]}
          label={levelLabel(level)}
          hint={selected === level ? t("filtering") : undefined}
          onClick={() => {
            onSelect(selected === level ? "" : level);
          }}
          className={cn(selected === level && "ring-2 ring-accent")}
        />
      ))}
    </StatGrid>
  );
}
