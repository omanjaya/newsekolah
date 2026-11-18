import { describe, expect, it } from "vitest";

import {
  decimalSeparator,
  formatNumber,
  fractionDigitsOf,
  parseNumberText,
  roundTo,
  sanitizeNumberText,
} from "./locale-number.js";

/** What a NumberInput makes of `text`: sanitized as typed, then read. */
function read(text: string, locale: string, precision: number): number | null {
  const sanitized = sanitizeNumberText(text, { locale, precision, allowNegative: true });
  return parseNumberText(sanitized, { locale, precision });
}

describe("locale-number", () => {
  it("keeps digits, separators and a leading minus, and caps the fraction", () => {
    expect(decimalSeparator("id-ID")).toBe(",");
    expect(decimalSeparator("en-US")).toBe(".");
    const options = { locale: "id-ID", precision: 1, allowNegative: false };
    expect(sanitizeNumberText("85,55", options)).toBe("85,5");
    expect(sanitizeNumberText("85.5", options)).toBe("85.5");
    expect(sanitizeNumberText("8a5-", options)).toBe("85");
    expect(sanitizeNumberText("-3", options)).toBe("3");
    expect(sanitizeNumberText("-3", { ...options, allowNegative: true })).toBe("-3");
    expect(sanitizeNumberText("1.000", { ...options, precision: 0 })).toBe("1.000");
    // A whole-number field keeps the separator so the next digit cannot join the integer.
    expect(sanitizeNumberText("85,5", { ...options, precision: 0 })).toBe("85,");
  });

  it("reads Indonesian grouping and decimals by the locale", () => {
    expect(read("85,5", "id-ID", 0)).toBe(85);
    expect(read("1.234,56", "id-ID", 0)).toBe(1234);
    expect(read("1.500.000,75", "id-ID", 2)).toBe(1500000.75);
    expect(read("1.500.000,5", "id-ID", 1)).toBe(1500000.5);
    expect(read("1.500", "id-ID", 2)).toBe(1500);
    expect(read("1.500.000", "id-ID", 0)).toBe(1500000);
    expect(read("85,25", "id-ID", 1)).toBe(85.2);
  });

  it("reads English grouping and decimals by the locale", () => {
    expect(read("1,500.75", "en-US", 2)).toBe(1500.75);
    expect(read("1,234.56", "en-US", 0)).toBe(1234);
    expect(read("1,500", "en-US", 2)).toBe(1500);
    expect(read("85.5", "en-US", 1)).toBe(85.5);
  });

  it("takes the other separator as a decimal point when it is alone and short enough", () => {
    // A phone keypad in another region offers "." where Indonesian writes ",".
    expect(read("85.5", "id-ID", 1)).toBe(85.5);
    expect(read("85.25", "id-ID", 2)).toBe(85.25);
    expect(read("1,5", "en-US", 2)).toBe(1.5);
    // Typing "1.500.000" one key at a time passes through "1.5" and ends grouped.
    expect(read("1.5", "id-ID", 2)).toBe(1.5);
    expect(read("1.500.0", "id-ID", 2)).toBe(15000);
  });

  it("never parses to NaN", () => {
    const options = { locale: "id-ID", precision: 2 };
    expect(parseNumberText("", options)).toBeNull();
    expect(parseNumberText("-", options)).toBeNull();
    expect(parseNumberText(",", options)).toBeNull();
    expect(parseNumberText("12,", options)).toBe(12);
    expect(parseNumberText("-2,5", options)).toBe(-2.5);
    expect(Object.is(parseNumberText("-0", options), 0)).toBe(true);
  });

  it("derives precision from the step and rounds without float drift", () => {
    expect(fractionDigitsOf(1)).toBe(0);
    expect(fractionDigitsOf(0.25)).toBe(2);
    expect(fractionDigitsOf(85.25)).toBe(2);
    expect(fractionDigitsOf(1e-7)).toBe(7);
    expect(fractionDigitsOf(1.5e-10)).toBe(11);
    expect(fractionDigitsOf(1e21)).toBe(0);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
  });

  it("rounds halves away from zero on both sides", () => {
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(-2.5, 0)).toBe(-3);
    expect(roundTo(2.5, 0)).toBe(3);
    expect(Object.is(roundTo(-0.4, 0), 0)).toBe(true);
  });

  it("formats with or without thousands grouping", () => {
    expect(formatNumber(1500000, "id-ID", { precision: 0, useGrouping: true })).toBe("1.500.000");
    expect(formatNumber(1500000, "id-ID", { precision: 0, useGrouping: false })).toBe("1500000");
    expect(formatNumber(85.5, "id-ID", { precision: 1, useGrouping: false })).toBe("85,5");
  });
});
