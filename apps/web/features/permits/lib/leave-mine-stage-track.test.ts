import { describe, expect, it } from "vitest";

import { buildMineStageTrack } from "./leave-mine-stage-track";

describe("buildMineStageTrack", () => {
  it("always has exactly four nodes: submitted, two stages, done", () => {
    const nodes = buildMineStageTrack("in_progress", 0);
    expect(nodes.map((n) => n.id)).toEqual(["submitted", "homeroom", "counselor", "done"]);
  });

  it("marks 'submitted' as complete no matter the status", () => {
    for (const status of [
      "in_progress",
      "approved",
      "completed",
      "rejected",
      "cancelled",
      "expired",
    ] as const) {
      expect(buildMineStageTrack(status, 0)[0]?.state).toBe("complete");
    }
  });

  it("in_progress at stage 0: homeroom is current, counselor and done are upcoming", () => {
    const nodes = buildMineStageTrack("in_progress", 0);
    expect(nodes.map((n) => n.state)).toEqual(["complete", "current", "upcoming", "upcoming"]);
  });

  it("approved: both stages read complete, but done stays upcoming until the letter is issued", () => {
    const nodes = buildMineStageTrack("approved", 1);
    expect(nodes.map((n) => n.state)).toEqual(["complete", "complete", "complete", "upcoming"]);
  });

  it("completed: every node, including done, reads complete", () => {
    const nodes = buildMineStageTrack("completed", 1);
    expect(nodes.map((n) => n.state)).toEqual(["complete", "complete", "complete", "complete"]);
  });

  it("rejected at the homeroom stage: that stage stops, counselor and done never reached", () => {
    const nodes = buildMineStageTrack("rejected", 0);
    expect(nodes.map((n) => n.state)).toEqual(["complete", "stopped", "upcoming", "upcoming"]);
  });

  it("cancelled and expired stop the current stage just like rejected", () => {
    for (const status of ["cancelled", "expired"] as const) {
      const nodes = buildMineStageTrack(status, 1);
      expect(nodes.map((n) => n.state)).toEqual(["complete", "complete", "stopped", "upcoming"]);
    }
  });

  it("clamps a negative stage index to the first stage", () => {
    const nodes = buildMineStageTrack("in_progress", -1);
    expect(nodes[1]?.state).toBe("current");
  });

  it("clamps an out-of-range stage index to the last stage", () => {
    const nodes = buildMineStageTrack("in_progress", 99);
    expect(nodes[1]?.state).toBe("complete");
    expect(nodes[2]?.state).toBe("current");
  });
});
