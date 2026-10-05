import { describe, expect, it } from "vitest";

import { buildGradebookPageTiles, buildGradingEntryTiles } from "./grading-tiles";

describe("buildGradingEntryTiles", () => {
  it("builds the four entry tiles with the resolved publish status text", () => {
    const tiles = buildGradingEntryTiles(32, 4, 75, true, "Diterbitkan", "Draf");
    expect(tiles.map((t) => t.key)).toEqual(["students", "components", "filled", "published"]);
    expect(tiles[0]?.value).toBe("32");
    expect(tiles[1]?.value).toBe("4");
    expect(tiles[2]?.value).toBe("75%");
    expect(tiles[3]?.value).toBe("Diterbitkan");
    expect(tiles[3]?.tone).toBe("green");
  });

  it("uses the draft status text and tone when not published", () => {
    const tiles = buildGradingEntryTiles(32, 4, 0, false, "Diterbitkan", "Draf");
    expect(tiles[3]?.value).toBe("Draf");
    expect(tiles[3]?.tone).toBe("amber");
  });
});

describe("buildGradebookPageTiles", () => {
  it("shows a dash for an average that has not been computed yet", () => {
    const tiles = buildGradebookPageTiles(undefined, 0, 32);
    expect(tiles[0]?.value).toBe("-");
  });

  it("formats a computed average to one decimal", () => {
    const tiles = buildGradebookPageTiles(84.567, 60, 5);
    expect(tiles[0]?.value).toBe("84.6");
    expect(tiles[1]?.value).toBe("60%");
    expect(tiles[2]?.value).toBe("5");
  });
});
