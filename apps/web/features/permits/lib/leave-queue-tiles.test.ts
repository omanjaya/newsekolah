import { describe, expect, it } from "vitest";

import { buildLeaveQueueTiles } from "./leave-queue-tiles";

describe("buildLeaveQueueTiles", () => {
  it("builds exactly one tile carrying the count", () => {
    const tiles = buildLeaveQueueTiles(4);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ key: "waiting", value: 4 });
  });

  it("counts zero rather than omitting the tile for an empty queue", () => {
    expect(buildLeaveQueueTiles(0)[0]?.value).toBe(0);
  });
});
