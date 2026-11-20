import { expect, it } from "vitest";

import { formatScore } from "./format-score";

it("uses a decimal comma for the Indonesian locale", () => {
  expect(formatScore(88, "id")).toBe("88,0");
  expect(formatScore(77.55, "id")).toBe("77,55");
});

it("uses a decimal point for English", () => {
  expect(formatScore(88, "en")).toBe("88.0");
  expect(formatScore(91.25, "en")).toBe("91.25");
});

it("keeps the scale's precision instead of rounding to one decimal", () => {
  expect(formatScore(75.23, "id", 2)).toBe("75,23");
  expect(formatScore(84.567, "id", 2)).toBe("84,57");
  expect(formatScore(84.567, "id", 1)).toBe("84,6");
  expect(formatScore(84.567, "id", 0)).toBe("85");
});

it("never shows a score just under the KKTP as the KKTP itself", () => {
  expect(formatScore(74.96, "id", 2)).toBe("74,96");
});
