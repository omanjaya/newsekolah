import { describe, expect, it } from "vitest";

import { buildExitPermitQueueTiles } from "./exit-permit-queue-tiles";

const items = [
  { status: "in_progress" as const },
  { status: "in_progress" as const },
  { status: "approved" as const },
];

describe("buildExitPermitQueueTiles", () => {
  it("gives an approver a single tile counting in-progress items", () => {
    const tiles = buildExitPermitQueueTiles(items, true, false);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ key: "waitingApproval", value: 2 });
  });

  it("gives the gate a single tile counting approved items", () => {
    const tiles = buildExitPermitQueueTiles(items, false, true);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ key: "awaitingGate", value: 1 });
  });

  it("gives someone who holds both roles both tiles, in a stable order", () => {
    const tiles = buildExitPermitQueueTiles(items, true, true);
    expect(tiles.map((t) => t.key)).toEqual(["waitingApproval", "awaitingGate"]);
    expect(tiles.map((t) => t.value)).toEqual([2, 1]);
  });

  it("gives nobody without either role any tile", () => {
    expect(buildExitPermitQueueTiles(items, false, false)).toEqual([]);
  });

  it("counts zero rather than omitting the tile when the queue is empty", () => {
    const tiles = buildExitPermitQueueTiles([], true, true);
    expect(tiles.map((t) => t.value)).toEqual([0, 0]);
  });

  it("gives each tile a distinct tone", () => {
    const tiles = buildExitPermitQueueTiles(items, true, true);
    const tones = new Set(tiles.map((t) => t.tone));
    expect(tones.size).toBe(tiles.length);
  });
});
