import type { ReactNode } from "react";

/**
 * A card slot placed in a bento-style grid: identity plus its rendered
 * content. Shared shape for any feature (dashboard home, the attendance day
 * list, ...) that lays cards out with `bentoCells`/`tileColumns`.
 */
export interface LayoutSlot {
  key: string;
  node: ReactNode;
}

/** A card slot placed in the one-column bento grid, "full" spanning both columns. */
export interface BentoCell extends LayoutSlot {
  span: "half" | "full";
}

/**
 * Pairs every card slot into the 50:50 bento grid (`grid gap-4 lg:grid-cols-2`):
 * cards fill the grid in order, two per row. An odd count leaves the last card
 * without a partner, so it spans both columns instead of sitting alone in a
 * half-width cell.
 */
export function bentoCells(slots: LayoutSlot[]): BentoCell[] {
  const oddCountOut = slots.length % 2 === 1;
  return slots.map((slot, index) => ({
    ...slot,
    span: oddCountOut && index === slots.length - 1 ? "full" : "half",
  }));
}

/** Static class map so Tailwind's scanner generates every `lg:grid-cols-*` it can pick. */
const LG_TILE_COLS: Record<1 | 2 | 3 | 4, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

export interface TileGridLayout {
  /** Grid container classes: even columns on small screens, `n` equal columns on `lg`. */
  container: string;
  /** Extra classes for the last tile only, so it fills the row when `n` is odd on small screens. */
  lastTileClassName: string;
}

/**
 * The stat-tile row's grid classes for `n` tiles (1-4): `n` equal columns on
 * `lg`, 2 columns below that (1 if there is only one tile). When `n` is odd
 * on the small 2-column grid the last tile would otherwise sit alone in a
 * half-filled row, so it spans the full row there (never on `lg`, where it
 * already has its own column).
 */
export function tileColumns(n: number): TileGridLayout {
  const count = Math.min(Math.max(Math.trunc(n), 1), 4) as 1 | 2 | 3 | 4;
  const oddOnSmallGrid = count % 2 === 1 && count > 1;
  return {
    container: `grid ${count === 1 ? "grid-cols-1" : "grid-cols-2"} gap-3 ${LG_TILE_COLS[count]}`,
    lastTileClassName: oddOnSmallGrid ? "col-span-2 lg:col-span-1" : "",
  };
}
