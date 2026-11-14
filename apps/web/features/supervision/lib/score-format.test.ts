import { describe, expect, it } from "vitest";

import { averageScore, formatScore } from "./score-format";

describe("score formatting", () => {
  it("writes averages with two decimals in the reader's locale", () => {
    expect(formatScore(3.25, "id")).toBe("3,25");
    expect(formatScore(3, "en")).toBe("3.00");
  });

  it("averages an observation's scores, and has none without scores", () => {
    expect(averageScore([{ score: 3 }, { score: 4 }])).toBe(3.5);
    expect(averageScore([])).toBeNull();
  });
});
