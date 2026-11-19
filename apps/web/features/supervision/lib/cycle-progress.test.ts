import { describe, expect, it } from "vitest";

import { cycleStepIndex } from "./cycle-progress";

describe("cycleStepIndex", () => {
  it("stays on scheduling until a visit is planned", () => {
    expect(cycleStepIndex(0, 0)).toBe(1);
  });

  it("stays on observing while a visit is still to be filled in", () => {
    expect(cycleStepIndex(3, 0)).toBe(2);
    expect(cycleStepIndex(3, 2)).toBe(2);
  });

  it("reaches the results once every visit is observed", () => {
    expect(cycleStepIndex(3, 3)).toBe(3);
  });
});
