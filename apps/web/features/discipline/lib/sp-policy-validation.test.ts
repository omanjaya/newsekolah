import { describe, expect, it } from "vitest";

import { validateLevels } from "./sp-policy-validation";

describe("validateLevels", () => {
  it("accepts a ladder whose thresholds rise level by level", () => {
    expect(
      validateLevels([
        { label: "SP 1", minPoints: "25" },
        { label: "SP 2", minPoints: "50" },
        { label: "SP 3", minPoints: "75" },
      ]).size,
    ).toBe(0);
  });

  it("marks the row whose threshold is not above the one before", () => {
    const errors = validateLevels([
      { label: "SP 1", minPoints: "25" },
      { label: "SP 2", minPoints: "20" },
      { label: "SP 3", minPoints: "75" },
    ]);
    expect([...errors.entries()]).toEqual([[1, { minPoints: "pointsMustIncrease" }]]);
  });

  it("treats an equal threshold as out of order", () => {
    const errors = validateLevels([
      { label: "SP 1", minPoints: "25" },
      { label: "SP 2", minPoints: "25" },
    ]);
    expect(errors.get(1)).toEqual({ minPoints: "pointsMustIncrease" });
  });

  it("asks for a label and a threshold above 0", () => {
    const errors = validateLevels([
      { label: "  ", minPoints: "" },
      { label: "SP 2", minPoints: "0" },
    ]);
    expect(errors.get(0)).toEqual({ label: "labelRequired", minPoints: "pointsRequired" });
    expect(errors.get(1)).toEqual({ minPoints: "pointsRequired" });
  });
});
