import { describe, expect, it } from "vitest";

import { buildAttendanceDayTiles } from "./attendance-day-tiles";

describe("buildAttendanceDayTiles", () => {
  it("builds exactly three tiles: total, saved, pending", () => {
    const tiles = buildAttendanceDayTiles(5, 2, 3);
    expect(tiles).toHaveLength(3);
    expect(tiles.map((t) => t.key)).toEqual(["total", "saved", "pending"]);
  });

  it("carries each count through to its tile untouched", () => {
    const tiles = buildAttendanceDayTiles(5, 2, 3);
    expect(tiles.map((t) => t.value)).toEqual([5, 2, 3]);
  });

  it("gives every tile a distinct category tone", () => {
    const tiles = buildAttendanceDayTiles(0, 0, 0);
    const tones = new Set(tiles.map((t) => t.tone));
    expect(tones.size).toBe(3);
  });
});
