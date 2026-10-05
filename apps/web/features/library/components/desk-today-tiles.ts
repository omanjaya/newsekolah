import type { StatTileTone } from "@newsekolah/ui";
import { BookCheck, BookPlus, BookX, Users2, type LucideIcon } from "lucide-react";

/** The subset of `GET /v1/library/dashboard`'s summary this row of stat tiles needs. */
export interface DeskTodaySummary {
  loans_today: number;
  returns_today: number;
  overdue: number;
  visits_today: number;
}

export interface DeskTodayTile {
  key: "loansToday" | "returnsToday" | "overdue" | "visitsToday";
  icon: LucideIcon;
  tone: StatTileTone;
  value: number;
  /** `app.library.desk.tiles.*` message key for the tile's label. */
  labelKey: "loansToday" | "returnsToday" | "overdue" | "visitsToday";
}

/**
 * The circulation desk's four equal-width stat tiles (docs/07-ui-ux.md
 * bento): today's loans, today's returns, how many loans are overdue, and
 * today's visits -- straight from the same `GET /v1/library/dashboard`
 * summary the library dashboard page already reads
 * (`features/library/dashboard-api.ts`), not a second endpoint.
 */
export function buildDeskTodayTiles(summary: DeskTodaySummary): DeskTodayTile[] {
  return [
    {
      key: "loansToday",
      icon: BookPlus,
      tone: "blue",
      value: summary.loans_today,
      labelKey: "loansToday",
    },
    {
      key: "returnsToday",
      icon: BookCheck,
      tone: "green",
      value: summary.returns_today,
      labelKey: "returnsToday",
    },
    { key: "overdue", icon: BookX, tone: "red", value: summary.overdue, labelKey: "overdue" },
    {
      key: "visitsToday",
      icon: Users2,
      tone: "purple",
      value: summary.visits_today,
      labelKey: "visitsToday",
    },
  ];
}
