"use client";

import { StatTile, cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { tileColumns } from "../../../lib/layout/bento";
import { buildGradebookPageTiles } from "../lib/grading-tiles";

/**
 * The opened gradebook's compact stat-tile row (docs/07-ui-ux.md): class
 * average, how much of the class is tuntas against its KKTP, and how many
 * students have nothing scored yet.
 */
export function GradebookPageTiles({
  classAverage,
  tuntasRate,
  ungradedCount,
}: {
  classAverage: number | undefined;
  tuntasRate: number;
  ungradedCount: number;
}): ReactElement {
  const t = useTranslations("app.grading");
  const tiles = buildGradebookPageTiles(classAverage, tuntasRate, ungradedCount);
  const grid = tileColumns(tiles.length);

  return (
    <div className={grid.container} data-testid="gradebook-page-tiles">
      {tiles.map((tile, index) => (
        <div
          key={tile.key}
          data-testid={`gradebook-page-tile-${tile.key}`}
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
