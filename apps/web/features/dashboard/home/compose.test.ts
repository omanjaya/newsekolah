import { CalendarCheck } from "lucide-react";
import { describe, expect, it } from "vitest";

import { collectBlocks, guardHero, guardTiles, isCalmHero, mergeTiles, pickHero } from "./compose";
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
      { tiles: [tile("x", 1)], main: [{ key: "l1", node: null }], side: [] },
      {
        hero: { key: "h", priority: 1, eyebrow: "", title: "h" },
        tiles: [],
        main: [{ key: "l2", node: null }],
        side: [{ key: "r1", node: null }],
      },
    ]);
    expect(out.hero?.key).toBe("h");
    expect(out.main.map((s) => s.key)).toEqual(["l1", "l2"]);
    expect(out.side.map((s) => s.key)).toEqual(["r1"]);
    expect(out.tiles.map((t) => t.key)).toEqual(["x"]);
    expect(out.pending).toBe(false);
    expect(out.failed).toBe(false);
  });
  it("reports a failure when any block's reads failed", () => {
    const out = collectBlocks([
      { tiles: [], main: [], side: [] },
      { tiles: [], main: [], side: [], failed: true },
    ]);
    expect(out.failed).toBe(true);
  });
  it("leaves out the tiles the winning hero already states, before the top four are cut", () => {
    const out = collectBlocks([
      {
        hero: { key: "h", priority: 2, eyebrow: "", title: "h", coversTiles: ["a", "b"] },
        tiles: [tile("a", 9), tile("b", 8), tile("c", 7), tile("d", 6), tile("e", 5)],
        main: [],
        side: [],
      },
      {
        hero: { key: "low", priority: 1, eyebrow: "", title: "low", coversTiles: ["c"] },
        tiles: [tile("f", 4)],
        main: [],
        side: [],
      },
    ]);
    // Only the winning hero covers tiles: "c" stays, "a" and "b" make room for "f".
    expect(out.tiles.map((t) => t.key)).toEqual(["c", "d", "e", "f"]);
  });
  it("is pending while any block still loads", () => {
    const out = collectBlocks([
      { tiles: [], main: [], side: [] },
      { tiles: [], main: [], side: [], pending: true },
    ]);
    expect(out.pending).toBe(true);
  });
});

describe("guardHero", () => {
  const hero = {
    key: "h",
    priority: 1,
    eyebrow: "",
    title: "h",
    action: { label: "Monitor", href: "/monitor" },
    secondaryAction: { label: "Laporan", href: "/reports?tab=school" },
  };
  it("keeps links the reader can open", () => {
    const out = guardHero(hero, () => true);
    expect(out.action?.href).toBe("/monitor");
    expect(out.secondaryAction?.href).toBe("/reports?tab=school");
  });
  it("promotes the secondary link when the primary would end on no access", () => {
    const out = guardHero(hero, (href) => href !== "/monitor");
    expect(out.action?.href).toBe("/reports?tab=school");
    expect(out.secondaryAction).toBeUndefined();
  });
  it("drops every action the reader cannot open", () => {
    const out = guardHero(hero, () => false);
    expect(out.action).toBeUndefined();
    expect(out.secondaryAction).toBeUndefined();
  });
});

describe("guardTiles", () => {
  it("unlinks a tile whose page the reader cannot open", () => {
    const out = guardTiles(
      [
        { ...tile("a", 1), href: "/monitor" },
        { ...tile("b", 1), href: "/inbox" },
      ],
      (href) => href === "/inbox",
    );
    expect(out.map((t) => t.href)).toEqual([undefined, "/inbox"]);
  });
});

describe("isCalmHero", () => {
  const hero = (priority: number, tone?: "neutral" | "accent-soft") => ({
    key: "h",
    priority,
    eyebrow: "",
    title: "h",
    ...(tone ? { tone } : {}),
  });
  it("treats a neutral hero or one ranked no higher than the idle inbox as calm", () => {
    expect(isCalmHero(hero(HERO_PRIORITY.schoolSummary, "neutral"))).toBe(true);
    expect(isCalmHero(hero(HERO_PRIORITY.teacherIdle))).toBe(true);
    expect(isCalmHero(hero(0))).toBe(true);
  });
  it("never treats work waiting on the reader as calm", () => {
    expect(isCalmHero(hero(HERO_PRIORITY.teacherNowPending))).toBe(false);
    expect(isCalmHero(hero(HERO_PRIORITY.picketIdle, "accent-soft"))).toBe(false);
    expect(isCalmHero(hero(HERO_PRIORITY.gateIdle))).toBe(false);
  });
});
