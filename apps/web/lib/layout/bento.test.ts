import { describe, expect, it } from "vitest";

import { bentoCells, tileColumns, type LayoutSlot } from "./bento";

describe("bentoCells", () => {
  const slot = (key: string): LayoutSlot => ({ key, node: null });

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
