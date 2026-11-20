import { describe, expect, it } from "vitest";

import { tpRangeProblem } from "./tp-ranges";

const scale = { min: 0, max: 100 };

function row(rMin: string, rMax: string, tMin: string, tMax: string) {
  return { r_min: rMin, r_max: rMax, t_min: tMin, t_max: tMax };
}

describe("tpRangeProblem", () => {
  it("accepts disjoint ranges, decimals included", () => {
    expect(tpRangeProblem(row("0", "74", "75", "100"), scale)).toBeNull();
    expect(tpRangeProblem(row("0", "59.5", "60", "100"), scale)).toBeNull();
  });

  it("refuses ranges that share a score", () => {
    expect(tpRangeProblem(row("0", "80", "75", "100"), scale)).toBe("overlap");
    expect(tpRangeProblem(row("0", "74", "74", "100"), scale)).toBe("overlap");
  });

  it("refuses a reversed range or one outside the scale", () => {
    expect(tpRangeProblem(row("0", "595", "60", "100"), scale)).toBe("invalid");
    expect(tpRangeProblem(row("80", "74", "75", "100"), scale)).toBe("invalid");
  });

  it("asks for every bound", () => {
    expect(tpRangeProblem(row("0", "", "75", "100"), scale)).toBe("incomplete");
  });
});
