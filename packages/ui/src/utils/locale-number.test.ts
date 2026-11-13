import { describe, expect, it } from "vitest";

import {
  decimalSeparator,
  formatNumber,
  fractionDigitsOf,
  parseNumberText,
  roundTo,
  sanitizeNumberText,
} from "./locale-number.js";

describe("locale-number", () => {
  it("accepts either separator as the decimal point and shows the locale's", () => {
    expect(decimalSeparator("id-ID")).toBe(",");
    expect(decimalSeparator("en-US")).toBe(".");
    const options = { locale: "id-ID", precision: 1, allowNegative: false };
    expect(sanitizeNumberText("85.5", options)).toBe("85,5");
    expect(sanitizeNumberText("85,55", options)).toBe("85,5");
    expect(sanitizeNumberText("8a5-", options)).toBe("85");
    expect(sanitizeNumberText("-3", options)).toBe("3");
    expect(sanitizeNumberText("-3", { ...options, allowNegative: true })).toBe("-3");
    expect(sanitizeNumberText("1.000", { ...options, precision: 0 })).toBe("1000");
  });

  it("never parses to NaN", () => {
    expect(parseNumberText("", "id-ID")).toBeNull();
    expect(parseNumberText("-", "id-ID")).toBeNull();
    expect(parseNumberText(",", "id-ID")).toBeNull();
    expect(parseNumberText("12,", "id-ID")).toBe(12);
    expect(parseNumberText("-2,5", "id-ID")).toBe(-2.5);
  });

  it("derives precision from the step and rounds without float drift", () => {
    expect(fractionDigitsOf(1)).toBe(0);
    expect(fractionDigitsOf(0.25)).toBe(2);
    expect(fractionDigitsOf(1e-7)).toBe(7);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
  });

  it("formats with or without thousands grouping", () => {
    expect(formatNumber(1500000, "id-ID", { precision: 0, useGrouping: true })).toBe("1.500.000");
    expect(formatNumber(1500000, "id-ID", { precision: 0, useGrouping: false })).toBe("1500000");
    expect(formatNumber(85.5, "id-ID", { precision: 1, useGrouping: false })).toBe("85,5");
  });
});
