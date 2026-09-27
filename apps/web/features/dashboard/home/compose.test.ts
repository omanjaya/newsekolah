import { CalendarCheck } from "lucide-react";
import { describe, expect, it } from "vitest";

import { bentoCells, collectBlocks, mergeTiles, pickHero, tileColumns } from "./compose";
import { HERO_PRIORITY, type BlockSlot, type TileSpec } from "./types";

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

describe("bentoCells", () => {
  const slot = (key: string): BlockSlot => ({ key, node: null });

  it("returns an empty list for no slots", () => {
    expect(bentoCells([])).toEqual([]);
  });

  it("spans the only card full-width for a single slot", () => {
    expect(bentoCells([slot("a")]).map((c) => c.span)).toEqual(["full"]);
  });

  it("pairs two slots half-width", () => {
    expect(bentoCells([slot("a"), slot("b")]).map((c) => c.span)).toEqual(["half", "half"]);
  });

  it("spans only the last of three slots full-width", () => {
    expect(bentoCells([slot("a"), slot("b"), slot("c")]).map((c) => c.span)).toEqual([
      "half",
      "half",
      "full",
    ]);
  });

  it("pairs four slots half-width with no leftover", () => {
    expect(bentoCells([slot("a"), slot("b"), slot("c"), slot("d")]).map((c) => c.span)).toEqual([
      "half",
      "half",
      "half",
      "half",
    ]);
  });

  it("spans only the last of five slots full-width", () => {
    const cells = bentoCells([slot("a"), slot("b"), slot("c"), slot("d"), slot("e")]);
    expect(cells.map((c) => c.span)).toEqual(["half", "half", "half", "half", "full"]);
    expect(cells.map((c) => c.key)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("tileColumns", () => {
  it("uses a single column on small screens and lg for one tile", () => {
    const layout = tileColumns(1);
    expect(layout.container).toBe("grid grid-cols-1 gap-3 lg:grid-cols-1");
    expect(layout.lastTileClassName).toBe("");
  });

  it("uses two equal columns for two tiles, no leftover span", () => {
    const layout = tileColumns(2);
    expect(layout.container).toBe("grid grid-cols-2 gap-3 lg:grid-cols-2");
    expect(layout.lastTileClassName).toBe("");
  });

  it("spans the third tile full-width on small screens only", () => {
    const layout = tileColumns(3);
    expect(layout.container).toBe("grid grid-cols-2 gap-3 lg:grid-cols-3");
    expect(layout.lastTileClassName).toBe("col-span-2 lg:col-span-1");
  });

  it("uses four equal columns for four tiles, no leftover span", () => {
    const layout = tileColumns(4);
    expect(layout.container).toBe("grid grid-cols-2 gap-3 lg:grid-cols-4");
    expect(layout.lastTileClassName).toBe("");
  });
});
