import { describe, expect, it } from "vitest";

import { blockCrossesBreak } from "./break-warning";

const periods = [
  { sequence: 1, is_break: false },
  { sequence: 2, is_break: false },
  { sequence: 3, is_break: true },
  { sequence: 4, is_break: false },
  { sequence: 5, is_break: false },
];

describe("blockCrossesBreak", () => {
  it("is false for a block entirely inside one side of the break", () => {
    expect(blockCrossesBreak({ start_seq: 1, end_seq: 2 }, periods)).toBe(false);
    expect(blockCrossesBreak({ start_seq: 4, end_seq: 5 }, periods)).toBe(false);
  });

  it("is true for a block that runs through the break to reach its end period", () => {
    expect(blockCrossesBreak({ start_seq: 2, end_seq: 4 }, periods)).toBe(true);
  });

  it("is true for a single-period block that starts on the break itself", () => {
    expect(blockCrossesBreak({ start_seq: 3, end_seq: 3 }, periods)).toBe(true);
  });

  it("is false when there is no break period at all", () => {
    const noBreaks = periods.map((p) => ({ ...p, is_break: false }));
    expect(blockCrossesBreak({ start_seq: 1, end_seq: 5 }, noBreaks)).toBe(false);
  });
});
