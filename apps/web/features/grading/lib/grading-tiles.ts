import type { StatTileTone } from "@newsekolah/ui";
import {
  BarChart3,
  CheckCircle2,
  CircleDashed,
  ListChecks,
  Megaphone,
  Percent,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface GradingTile {
  key: string;
  icon: LucideIcon;
  tone: StatTileTone;
  value: string;
  /** `app.grading.*` message key for the tile's label. */
  labelKey: string;
}

/**
 * The teacher entry page's stat-tile row (docs/07-ui-ux.md bento header):
 * how many students the currently open sheet covers, how many components
 * it has, how much of the grid is already filled, and whether it is
 * published -- the same four numbers a teacher needs before deciding
 * whether to open the grid at all.
 */
export function buildGradingEntryTiles(
  studentCount: number,
  componentCount: number,
  fillPercent: number,
  isPublished: boolean,
  publishedStatusLabel: string,
  draftStatusLabel: string,
): GradingTile[] {
  return [
    {
      key: "students",
      icon: Users,
      tone: "blue",
      value: String(studentCount),
      labelKey: "entryTiles.students",
    },
    {
      key: "components",
      icon: ListChecks,
      tone: "purple",
      value: String(componentCount),
      labelKey: "entryTiles.components",
    },
    {
      key: "filled",
      icon: Percent,
      tone: "amber",
      value: `${fillPercent}%`,
      labelKey: "entryTiles.filled",
    },
    {
      key: "published",
      icon: Megaphone,
      tone: isPublished ? "green" : "amber",
      value: isPublished ? publishedStatusLabel : draftStatusLabel,
      labelKey: "entryTiles.published",
    },
  ];
}

/**
 * The opened gradebook's compact stat-tile row: academic performance
 * instead of the entry page's plain counts -- class average, how much of
 * the class is already tuntas against its KKTP, and how many students
 * still have nothing scored at all.
 */
export function buildGradebookPageTiles(
  classAverage: number | undefined,
  tuntasRate: number,
  ungradedCount: number,
): GradingTile[] {
  return [
    {
      key: "average",
      icon: BarChart3,
      tone: "blue",
      value: classAverage === undefined ? "-" : classAverage.toFixed(1),
      labelKey: "pageTiles.average",
    },
    {
      key: "tuntas",
      icon: CheckCircle2,
      tone: "green",
      value: `${tuntasRate}%`,
      labelKey: "pageTiles.tuntas",
    },
    {
      key: "ungraded",
      icon: CircleDashed,
      tone: "amber",
      value: String(ungradedCount),
      labelKey: "pageTiles.ungraded",
    },
  ];
}
