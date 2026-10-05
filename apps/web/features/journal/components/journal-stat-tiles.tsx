"use client";

import { StatTile, cn } from "@newsekolah/ui";
import { CalendarCheck, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { tileColumns } from "../../../lib/layout/bento";
import type { JournalWeekStats } from "../lib/journal-week-stats";

/**
 * The two `/journal` stat tiles (docs/07-ui-ux.md's bento rule: tiles only
 * render as a row once there is more than one), both derived from the same
 * window `JournalTodayPanel` already fetches (`computeJournalWeekStats`).
 */
export function JournalStatTiles({
  weekStats,
}: {
  weekStats: JournalWeekStats;
}): ReactElement | null {
  const t = useTranslations("app.journal");
  const tiles = [
    {
      key: "filledWeek",
      icon: CalendarCheck,
      tone: "green" as const,
      value: String(weekStats.filledThisWeek),
      label: t("tiles.filledWeek"),
    },
    {
      key: "missingToday",
      icon: CircleAlert,
      tone: "amber" as const,
      value: String(weekStats.missingToday),
      label: t("tiles.missingToday"),
    },
  ];

  if (tiles.length <= 1) return null;
  const grid = tileColumns(tiles.length);

  return (
    <div className={grid.container} data-testid="journal-tiles">
      {tiles.map((tile, index) => (
        <div
          key={tile.key}
          data-testid={`journal-tile-${tile.key}`}
          className={cn("h-full", index === tiles.length - 1 && grid.lastTileClassName)}
        >
          <StatTile
            className="h-full"
            icon={tile.icon}
            tone={tile.tone}
            value={tile.value}
            label={tile.label}
          />
        </div>
      ))}
    </div>
  );
}
