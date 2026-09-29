import { describe, expect, it } from "vitest";

import { buildLateArrivalQueueTiles } from "./late-arrival-queue-tiles";

const items = [
  { opened_at: "2026-09-29T00:30:00Z" }, // 2026-09-29 in UTC
  { opened_at: "2026-09-28T23:50:00Z" }, // 2026-09-28 in UTC, still 2026-09-29 in +07:00
  { opened_at: "2026-09-27T01:00:00Z" }, // 2026-09-27
];

describe("buildLateArrivalQueueTiles", () => {
  it("builds exactly two tiles: waiting and today", () => {
    const tiles = buildLateArrivalQueueTiles(items, "2026-09-29");
    expect(tiles.map((t) => t.key)).toEqual(["waiting", "today"]);
  });

  it("counts every item as waiting, since the queue only ever holds in-progress ones", () => {
    const tiles = buildLateArrivalQueueTiles(items, "2026-09-29");
    expect(tiles[0]?.value).toBe(3);
  });

  it("counts only items opened on the given day, in the given zone", () => {
    const tiles = buildLateArrivalQueueTiles(items, "2026-09-29", "UTC");
    expect(tiles[1]?.value).toBe(1);
  });

  it("shifts the day boundary with the tenant's time zone", () => {
    const tiles = buildLateArrivalQueueTiles(items, "2026-09-29", "Asia/Jakarta");
    expect(tiles[1]?.value).toBe(2);
  });

  it("gives each tile a distinct tone", () => {
    const tiles = buildLateArrivalQueueTiles(items, "2026-09-29");
    const tones = new Set(tiles.map((t) => t.tone));
    expect(tones.size).toBe(2);
  });
});
