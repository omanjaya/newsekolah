import type { BlockSlot, HeroCandidate, PersonaBlock, TileSpec } from "./types";

/** A card slot placed in the one-column bento grid, "full" spanning both columns. */
export interface BentoCell extends BlockSlot {
  span: "half" | "full";
}

/**
 * Pairs every card slot into the 50:50 bento grid (`grid gap-4 lg:grid-cols-2`):
 * cards fill the grid in order, two per row. An odd count leaves the last card
 * without a partner, so it spans both columns instead of sitting alone in a
 * half-width cell.
 */
export function bentoCells(slots: BlockSlot[]): BentoCell[] {
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

/** The single most urgent hero candidate across all active persona blocks. */
export function pickHero(candidates: HeroCandidate[]): HeroCandidate | undefined {
  return candidates.reduce<HeroCandidate | undefined>(
    (best, c) => (!best || c.priority > best.priority ? c : best),
    undefined,
  );
}

/** The top `max` tiles by priority, deduped by key (highest priority wins), stable on ties. */
export function mergeTiles(tiles: TileSpec[], max = 4): TileSpec[] {
  const byKey = new Map<string, TileSpec>();
  for (const tile of tiles) {
    const seen = byKey.get(tile.key);
    if (!seen || tile.priority > seen.priority) byKey.set(tile.key, tile);
  }
  return [...byKey.values()].sort((a, b) => b.priority - a.priority).slice(0, max);
}

/** Merges every active persona block into the shape the dashboard view renders. */
export function collectBlocks(blocks: PersonaBlock[]): {
  hero?: HeroCandidate;
  tiles: TileSpec[];
  left: BlockSlot[];
  right: BlockSlot[];
} {
  return {
    hero: pickHero(blocks.flatMap((b) => (b.hero ? [b.hero] : []))),
    tiles: mergeTiles(blocks.flatMap((b) => b.tiles)),
    left: blocks.flatMap((b) => b.left),
    right: blocks.flatMap((b) => b.right),
  };
}
