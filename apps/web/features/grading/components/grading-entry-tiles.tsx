"use client";

import { StatTile, cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { tileColumns } from "../../../lib/layout/bento";
import { buildGradingEntryTiles } from "../lib/grading-tiles";

/**
 * The teacher entry page's stat-tile row (docs/07-ui-ux.md): how many
 * students, how many components, how much of the grid is filled, and
 * whether it is published -- for whichever class/subject is currently
 * selected by the pill pickers above it.
 */
export function GradingEntryTiles({
  studentCount,
  componentCount,
  fillPercent,
  isPublished,
}: {
  studentCount: number;
  componentCount: number;
  fillPercent: number;
  isPublished: boolean;
}): ReactElement {
  const t = useTranslations("app.grading");
  const tiles = buildGradingEntryTiles(
    studentCount,
    componentCount,
    fillPercent,
    isPublished,
    t("entryTiles.publishedValue"),
    t("entryTiles.draftValue"),
  );
  const grid = tileColumns(tiles.length);

  return (
    <div className={grid.container} data-testid="grading-entry-tiles">
      {tiles.map((tile, index) => (
        <div
          key={tile.key}
          data-testid={`grading-entry-tile-${tile.key}`}
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
