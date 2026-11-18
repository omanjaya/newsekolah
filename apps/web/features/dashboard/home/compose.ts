import type { BlockSlot, HeroCandidate, HeroLink, PersonaBlock, TileSpec } from "./types";

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

/**
 * Merges every active persona block into the shape the dashboard view
 * renders. The tiles the winning hero already states (`coversTiles`) are
 * dropped before the top four are taken, so another tile can fill the row.
 */
export function collectBlocks(blocks: PersonaBlock[]): {
  hero?: HeroCandidate;
  tiles: TileSpec[];
  main: BlockSlot[];
  side: BlockSlot[];
  pending: boolean;
} {
  const hero = pickHero(blocks.flatMap((b) => (b.hero ? [b.hero] : [])));
  const covered = new Set(hero?.coversTiles ?? []);
  return {
    hero,
    tiles: mergeTiles(blocks.flatMap((b) => b.tiles).filter((tile) => !covered.has(tile.key))),
    main: blocks.flatMap((b) => b.main),
    side: blocks.flatMap((b) => b.side),
    pending: blocks.some((b) => b.pending === true),
  };
}

/**
 * The hero with every link the reader cannot open taken out: a primary
 * action that would end on "no access" is replaced by the secondary one
 * when that one opens, else dropped, so the home never sends anyone to a
 * dead end (audit home-personal-02).
 */
export function guardHero(hero: HeroCandidate, canOpen: (href: string) => boolean): HeroCandidate {
  const opens = (link: HeroLink | undefined) =>
    link !== undefined && canOpen(link.href.split("?")[0] ?? link.href);
  const action = opens(hero.action)
    ? hero.action
    : opens(hero.secondaryAction)
      ? hero.secondaryAction
      : undefined;
  const secondaryAction =
    opens(hero.secondaryAction) && hero.secondaryAction !== action
      ? hero.secondaryAction
      : undefined;
  return { ...hero, action, secondaryAction };
}

/** The tiles with every link the reader cannot open removed (the tile stays, as plain figures). */
export function guardTiles(tiles: TileSpec[], canOpen: (href: string) => boolean): TileSpec[] {
  return tiles.map((tile) =>
    tile.href === undefined || canOpen(tile.href.split("?")[0] ?? tile.href)
      ? tile
      : { ...tile, href: undefined },
  );
}
