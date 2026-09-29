import { CalendarCheck } from "lucide-react";
import { describe, expect, it } from "vitest";

import { collectBlocks, mergeTiles, pickHero } from "./compose";
import { HERO_PRIORITY, type TileSpec } from "./types";

const tile = (key: string, priority: number): TileSpec => ({
  key,
  priority,
  label: key,
  value: "1",
  icon: CalendarCheck,
  tone: "green",
});

describe("pickHero", () => {
  it("returns the highest priority candidate", () => {
    const hero = pickHero([
      { key: "a", priority: HERO_PRIORITY.schoolSummary, eyebrow: "", title: "a" },
      { key: "b", priority: HERO_PRIORITY.teacherNowPending, eyebrow: "", title: "b" },
    ]);
    expect(hero?.key).toBe("b");
  });
  it("returns undefined for no candidates", () => {
    expect(pickHero([])).toBeUndefined();
  });
});

describe("mergeTiles", () => {
  it("keeps the top four by priority, stable on ties, deduped by key", () => {
    const out = mergeTiles([
      tile("a", 1),
      tile("b", 5),
      tile("c", 5),
      tile("b", 9),
      tile("d", 3),
      tile("e", 2),
    ]);
    expect(out.map((t) => t.key)).toEqual(["b", "c", "d", "e"]);
  });
});

describe("collectBlocks", () => {
  it("stacks columns in block order and picks one hero", () => {
    const out = collectBlocks([
      { tiles: [tile("x", 1)], left: [{ key: "l1", node: null }], right: [] },
      {
        hero: { key: "h", priority: 1, eyebrow: "", title: "h" },
        tiles: [],
        left: [{ key: "l2", node: null }],
        right: [{ key: "r1", node: null }],
      },
    ]);
    expect(out.hero?.key).toBe("h");
    expect(out.left.map((s) => s.key)).toEqual(["l1", "l2"]);
    expect(out.right.map((s) => s.key)).toEqual(["r1"]);
    expect(out.tiles.map((t) => t.key)).toEqual(["x"]);
  });
});

// `bentoCells`/`tileColumns` moved to `apps/web/lib/layout/bento.ts` (shared
// with the attendance day list); see `bento.test.ts` there.
