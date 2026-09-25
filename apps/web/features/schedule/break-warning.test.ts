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

  // docs/analysis/ux-audit-2026-09-25.md Finding 3: verified this is not a
  // false positive in blockCrossesBreak itself. The tenant's default
  // template (cmd/seed/operations.go's "Reguler", 10 periods, breaks at
  // sequence 4 and 8) is what every schedule screen checks against
  // (features/reference/api.ts's usePeriodsQuery). A live dev-DB class
  // ("X-1", not created by cmd/seed) had one single-period block at every
  // sequence 1-10 on every school day -- including 4 and 8, i.e. a lesson
  // literally scheduled during the break itself -- imported (source:
  // "import") against a second, non-default template whose sequences
  // happen to carry no breaks at all. Reproduced here against the real
  // default template shape: blockCrossesBreak correctly flags exactly
  // those two slots and nothing else, so the audit's "11 of ~20 blocks
  // flagged" was genuinely bad data (a stale/mismatched import), not a
  // logic bug -- no change was needed here or in cmd/seed.
  it("flags a single-period lesson scheduled exactly on the default template's break (the X-1 case)", () => {
    // Mirrors cmd/seed/operations.go's regularPeriods: 1,2,3, break(4),
    // 5,6,7, break(8), 9,10.
    const reguler = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((sequence) => ({
      sequence,
      is_break: sequence === 4 || sequence === 8,
    }));

    for (const sequence of [1, 2, 3, 5, 6, 7, 9, 10]) {
      expect(blockCrossesBreak({ start_seq: sequence, end_seq: sequence }, reguler)).toBe(false);
    }
    expect(blockCrossesBreak({ start_seq: 4, end_seq: 4 }, reguler)).toBe(true);
    expect(blockCrossesBreak({ start_seq: 8, end_seq: 8 }, reguler)).toBe(true);
  });
});
