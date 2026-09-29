import type { BlockSlot, HeroCandidate, PersonaBlock, TileSpec } from "./types";

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
