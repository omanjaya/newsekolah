import { describe, expect, it } from "vitest";

import { buildMonthGrid, toISODate } from "./calendar-dates";

describe("toISODate", () => {
  it("keys a local-midnight date by its own day, whatever the zone offset", () => {
    expect(toISODate(new Date(2026, 10, 14))).toBe("2026-11-14");
    expect(toISODate(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("buildMonthGrid", () => {
  it("starts on the Monday on or before the first and spans 42 consecutive days", () => {
    const grid = buildMonthGrid(new Date(2026, 10, 1)).map((cell) => ({
      iso: toISODate(cell.date),
      inMonth: cell.inMonth,
    }));
    expect(grid).toHaveLength(42);
    expect(grid[0]?.iso).toBe("2026-10-26");
    expect(grid[0]?.inMonth).toBe(false);
    expect(grid[6]?.iso).toBe("2026-11-01");
    expect(grid[6]?.inMonth).toBe(true);
    expect(new Set(grid.map((d) => d.iso)).size).toBe(42);
  });
});
