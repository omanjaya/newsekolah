import { describe, expect, it } from "vitest";

import { dayKey, groupByDay, shiftDayKey } from "./group-by-day";

describe("dayKey", () => {
  it("keys a timestamp by the given time zone, not UTC", () => {
    // 23:30 in Makassar (UTC+8) on the 23rd is already the 24th locally.
    expect(dayKey("2026-09-23T15:30:00Z", "Asia/Makassar")).toBe("2026-09-23");
    expect(dayKey("2026-09-23T16:30:00Z", "Asia/Makassar")).toBe("2026-09-24");
  });
});

describe("groupByDay", () => {
  it("buckets items by day, preserving newest-first order within and across groups", () => {
    const items = [
      { id: "a", at: "2026-09-24T08:00:00Z" },
      { id: "b", at: "2026-09-24T01:00:00Z" },
      { id: "c", at: "2026-09-23T10:00:00Z" },
      { id: "d", at: "2026-09-23T09:00:00Z" },
    ];

    const groups = groupByDay(items, (item) => item.at, "UTC");

    expect(groups).toHaveLength(2);
    expect(groups[0]?.dateKey).toBe("2026-09-24");
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1]?.dateKey).toBe("2026-09-23");
    expect(groups[1]?.items.map((i) => i.id)).toEqual(["c", "d"]);
  });

  it("merges every item for the same day into one group, wherever it falls in the list", () => {
    const items = [
      { id: "a", at: "2026-09-24T08:00:00Z" },
      { id: "b", at: "2026-09-23T08:00:00Z" },
      { id: "c", at: "2026-09-24T09:00:00Z" },
    ];

    const groups = groupByDay(items, (item) => item.at, "UTC");

    expect(groups.map((g) => g.dateKey)).toEqual(["2026-09-24", "2026-09-23"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByDay([], () => "2026-09-24T00:00:00Z")).toEqual([]);
  });
});

describe("shiftDayKey", () => {
  it("moves back a day, crossing a month boundary", () => {
    expect(shiftDayKey("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("moves forward a day", () => {
    expect(shiftDayKey("2026-09-23", 1)).toBe("2026-09-24");
  });
});
