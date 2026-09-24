import { describe, expect, it } from "vitest";

import type { SPPolicy } from "../api";
import type { PointsPreviewEntry } from "../api-violation-extras";

import { computePointsPreview } from "./points-preview";

const policy: SPPolicy = {
  version: 1,
  levels: [
    { level: 1, min_points: 25, label: "SP 1" },
    { level: 2, min_points: 50, label: "SP 2" },
    { level: 3, min_points: 75, label: "SP 3" },
  ],
};

function entry(overrides: Partial<PointsPreviewEntry> = {}): PointsPreviewEntry {
  return { student_user_id: "s1", total_points: 0, issued_levels: [], ...overrides };
}

describe("computePointsPreview", () => {
  it("carries current, added and new totals through for each student", () => {
    const rows = computePointsPreview([entry({ total_points: 10 })], 5, policy);
    expect(rows).toEqual([
      {
        studentUserId: "s1",
        currentPoints: 10,
        addedPoints: 5,
        newPoints: 15,
        crossedLevels: [],
      },
    ]);
  });

  it("flags a level the new total reaches but the current total had not", () => {
    const rows = computePointsPreview([entry({ total_points: 20 })], 10, policy);
    expect(rows[0]?.newPoints).toBe(30);
    expect(rows[0]?.crossedLevels).toEqual([{ level: 1, min_points: 25, label: "SP 1" }]);
  });

  it("does not flag a level already reached before this call", () => {
    const rows = computePointsPreview([entry({ total_points: 30 })], 5, policy);
    expect(rows[0]?.newPoints).toBe(35);
    expect(rows[0]?.crossedLevels).toEqual([]);
  });

  it("does not flag a level already issued, even if the total newly crosses it again", () => {
    const rows = computePointsPreview(
      [entry({ total_points: 20, issued_levels: [1] })],
      10,
      policy,
    );
    expect(rows[0]?.crossedLevels).toEqual([]);
  });

  it("can flag several levels crossed at once, lowest first", () => {
    const rows = computePointsPreview([entry({ total_points: 10 })], 70, policy);
    expect(rows[0]?.newPoints).toBe(80);
    expect(rows[0]?.crossedLevels.map((l) => l.level)).toEqual([1, 2, 3]);
  });

  it("treats a missing policy as no levels configured", () => {
    const rows = computePointsPreview([entry({ total_points: 10 })], 100, undefined);
    expect(rows[0]?.crossedLevels).toEqual([]);
  });

  it("maps one row per requested entry, independent of each other", () => {
    const rows = computePointsPreview(
      [
        entry({ student_user_id: "a", total_points: 0 }),
        entry({ student_user_id: "b", total_points: 24 }),
      ],
      5,
      policy,
    );
    expect(rows.map((r) => r.studentUserId)).toEqual(["a", "b"]);
    expect(rows[0]?.crossedLevels).toEqual([]);
    expect(rows[1]?.crossedLevels).toEqual([{ level: 1, min_points: 25, label: "SP 1" }]);
  });
});
