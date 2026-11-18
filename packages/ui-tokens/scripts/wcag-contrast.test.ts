import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "./wcag-contrast.js";

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

  it("refuses a translucent color, which has no contrast until composited", () => {
    expect(() => contrastRatio("rgba(0, 0, 0, 0.5)", "#FFFFFF")).toThrow(/opaque/);
  });
});

describe("parseColor", () => {
  it("reads hex and rgba notations", () => {
    expect(parseColor("#0F7A5F")).toEqual({ r: 15, g: 122, b: 95, a: 1 });
    expect(parseColor("rgba(27, 29, 26, 0.05)")).toEqual({ r: 27, g: 29, b: 26, a: 0.05 });
    expect(parseColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
  });

  it("rejects anything else rather than guessing", () => {
    expect(() => parseColor("teal")).toThrow(/Unsupported/);
  });
});

describe("composite", () => {
  it("paints a translucent layer over an opaque color", () => {
    expect(composite("rgba(0, 0, 0, 0.5)", "#FFFFFF")).toBe("#808080");
  });

  it("returns an opaque top color unchanged", () => {
    expect(composite("#123456", "#FFFFFF")).toBe("#123456");
  });
});
