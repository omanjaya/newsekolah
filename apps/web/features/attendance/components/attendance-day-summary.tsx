"use client";

import { StatTile, cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { tileColumns } from "../../../lib/layout/bento";
import { buildAttendanceDayTiles } from "../lib/attendance-day-tiles";

/**
 * The day's totals as the bento stat-tile row (docs/07-ui-ux.md): sessions
 * today, saved, and still pending, laid out with the same `tileColumns`
 * helper the dashboard home uses so the row reads as the same visual
 * language across screens.
 */
export function AttendanceDayStats({
  total,
  saved,
  pending,
  className,
}: {
  total: number;
  saved: number;
  pending: number;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.attendance");
  const tiles = buildAttendanceDayTiles(total, saved, pending);
  const grid = tileColumns(tiles.length);

  return (
    <div className={cn(grid.container, className)} data-testid="attendance-day-tiles">
      {tiles.map((tile, index) => (
        <div
          key={tile.key}
          data-testid={`attendance-day-tile-${tile.key}`}
          className={cn("h-full", index === tiles.length - 1 && grid.lastTileClassName)}
        >
          <StatTile
            className="h-full"
            icon={tile.icon}
            tone={tile.tone}
            value={tile.value}
            label={t(tile.labelKey)}
          />
        </div>
      ))}
    </div>
  );
}
