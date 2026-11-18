import type { StatCategory } from "@newsekolah/ui";
import {
  BarChart3,
  CheckCircle2,
  CircleDashed,
  Percent,
  Users,
  type LucideIcon,
} from "lucide-react";

import { formatScore } from "./format-score";

export interface GradebookSummaryItem {
  key: "students" | "average" | "tuntas" | "ungraded" | "filled";
  icon: LucideIcon;
  tone: StatCategory;
  value: string;
  /** `app.grading.summary.*` message key for the figure's label. */
  labelKey: string;
}

export interface GradebookSummaryInput {
  studentCount: number;
  componentCount: number;
  /** 0-100, how many of the sheet's score slots hold a value. */
  fillPercent: number;
  classAverage: number | undefined;
  /** 0-100, the share of students at or above their KKTP. */
  tuntasRate: number;
  ungradedCount: number;
  locale?: string;
}

/**
 * The opened sheet's one summary strip (docs/superpowers/specs/
 * 2026-11-14-ui-overhaul-design.md section 7): who is on the sheet, how the
 * class is doing against its KKTP, and how much is still to fill -- the
 * figures that used to be spread over seven tiles above the table. With no
 * components there are no slots to fill or scores to judge, so those
 * figures read as a dash instead of a misleading "100%" or "0%".
 */
export function buildGradebookSummary({
  studentCount,
  componentCount,
  fillPercent,
  classAverage,
  tuntasRate,
  ungradedCount,
  locale,
}: GradebookSummaryInput): GradebookSummaryItem[] {
  const hasSlots = componentCount > 0;
  return [
    {
      key: "students",
      icon: Users,
      tone: "blue",
      value: String(studentCount),
      labelKey: "summary.students",
    },
    {
      key: "average",
      icon: BarChart3,
      tone: "purple",
      value: classAverage === undefined ? "-" : formatScore(classAverage, locale),
      labelKey: "summary.average",
    },
    {
      key: "tuntas",
      icon: CheckCircle2,
      tone: "green",
      value: hasSlots ? `${tuntasRate}%` : "-",
      labelKey: "summary.tuntas",
    },
    {
      key: "ungraded",
      icon: CircleDashed,
      tone: "amber",
      value: String(ungradedCount),
      labelKey: "summary.ungraded",
    },
    {
      key: "filled",
      icon: Percent,
      tone: "blue",
      value: hasSlots ? `${fillPercent}%` : "-",
      labelKey: "summary.filled",
    },
  ];
}
