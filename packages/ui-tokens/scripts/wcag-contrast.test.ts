import { describe, expect, it } from "vitest";

import { contrastRatio } from "./wcag-contrast.js";

describe("contrastRatio", () => {
  it("returns the maximum ratio for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
  });

  it("returns 1 for identical colors", () => {
    expect(contrastRatio("#1A1A1A", "#1A1A1A")).toBe(1);
  });

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio("#1A1A1A", "#F7F6F3")).toBe(contrastRatio("#F7F6F3", "#1A1A1A"));
  });

  it("matches the known #777777 on white reference value", () => {
    expect(contrastRatio("#FFFFFF", "#777777")).toBeCloseTo(4.48, 1);
  });
});
