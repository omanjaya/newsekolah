import { describe, expect, it } from "vitest";

import { buildDeskTodayTiles } from "./desk-today-tiles";

describe("buildDeskTodayTiles", () => {
  it("maps the dashboard summary straight onto the four tile values, in order", () => {
    const tiles = buildDeskTodayTiles({
      loans_today: 3,
      returns_today: 5,
      overdue: 2,
      visits_today: 14,
    });

    expect(tiles.map((tile) => tile.key)).toEqual([
      "loansToday",
      "returnsToday",
      "overdue",
      "visitsToday",
    ]);
    expect(tiles.map((tile) => tile.value)).toEqual([3, 5, 2, 14]);
  });

  it("gives every tile a distinct tone and its own label key", () => {
    const tiles = buildDeskTodayTiles({
      loans_today: 0,
      returns_today: 0,
      overdue: 0,
      visits_today: 0,
    });

    expect(new Set(tiles.map((tile) => tile.tone)).size).toBe(tiles.length);
    tiles.forEach((tile) => {
      expect(tile.labelKey).toBe(tile.key);
    });
  });
});
