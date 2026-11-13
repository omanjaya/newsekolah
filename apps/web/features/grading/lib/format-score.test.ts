import { expect, it } from "vitest";

import { formatScore } from "./format-score";

it("uses a decimal comma for the Indonesian locale", () => {
  expect(formatScore(88, "id")).toBe("88,0");
  expect(formatScore(84.567, "id")).toBe("84,6");
});

it("uses a decimal point for English", () => {
  expect(formatScore(88, "en")).toBe("88.0");
});
