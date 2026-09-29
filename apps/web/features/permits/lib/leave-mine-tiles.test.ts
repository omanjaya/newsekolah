import { describe, expect, it } from "vitest";

import type { WorkflowInstance } from "../api";

import { buildLeaveMineTiles, countLeaveMineStatuses } from "./leave-mine-tiles";

type Status = WorkflowInstance["status"];

describe("countLeaveMineStatuses", () => {
  it("counts everything as zero for an empty list", () => {
    expect(countLeaveMineStatuses([])).toEqual({
      total: 0,
      inProgress: 0,
      approved: 0,
      rejected: 0,
    });
  });

  it("buckets in_progress and approved together as still in progress", () => {
    const statuses: Status[] = ["in_progress", "approved", "in_progress"];
    expect(countLeaveMineStatuses(statuses)).toEqual({
      total: 3,
      inProgress: 3,
      approved: 0,
      rejected: 0,
    });
  });

  it("counts only completed as approved (the letter is out)", () => {
    const statuses: Status[] = ["completed", "completed"];
    expect(countLeaveMineStatuses(statuses)).toEqual({
      total: 2,
      inProgress: 0,
      approved: 2,
      rejected: 0,
    });
  });

  it("buckets rejected, cancelled, and expired together as rejected", () => {
    const statuses: Status[] = ["rejected", "cancelled", "expired"];
    expect(countLeaveMineStatuses(statuses)).toEqual({
      total: 3,
      inProgress: 0,
      approved: 0,
      rejected: 3,
    });
  });

  it("adds every count up to the total for a mixed list", () => {
    const statuses: Status[] = [
      "in_progress",
      "approved",
      "completed",
      "rejected",
      "cancelled",
      "expired",
    ];
    const counts = countLeaveMineStatuses(statuses);
    expect(counts.total).toBe(6);
    expect(counts.inProgress + counts.approved + counts.rejected).toBe(6);
  });
});

describe("buildLeaveMineTiles", () => {
  it("builds exactly four tiles: total, inProgress, approved, rejected", () => {
    const tiles = buildLeaveMineTiles({ total: 5, inProgress: 2, approved: 2, rejected: 1 });
    expect(tiles.map((tile) => tile.key)).toEqual(["total", "inProgress", "approved", "rejected"]);
  });

  it("carries each count through to its tile untouched", () => {
    const tiles = buildLeaveMineTiles({ total: 5, inProgress: 2, approved: 2, rejected: 1 });
    expect(tiles.map((tile) => tile.value)).toEqual([5, 2, 2, 1]);
  });

  it("gives every tile a distinct category tone", () => {
    const tiles = buildLeaveMineTiles({ total: 0, inProgress: 0, approved: 0, rejected: 0 });
    const tones = new Set(tiles.map((tile) => tile.tone));
    expect(tones.size).toBe(4);
  });
});
