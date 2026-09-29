import { describe, expect, it } from "vitest";

import { isCurrentPeriodCell, isCurrentPeriodRow, isNowWithinBlock } from "./current-period";

describe("isCurrentPeriodCell", () => {
  it("is true only when the day matches today and the sequence matches the current period", () => {
    expect(isCurrentPeriodCell(1, 1, 3, 3)).toBe(true);
  });

  it("is false when the day is not today, even if the sequence matches", () => {
    expect(isCurrentPeriodCell(2, 1, 3, 3)).toBe(false);
  });

  it("is false when the sequence does not match the current period", () => {
    expect(isCurrentPeriodCell(1, 1, 4, 3)).toBe(false);
  });

  it("is false when there is no period in session right now", () => {
    expect(isCurrentPeriodCell(1, 1, 3, undefined)).toBe(false);
  });
});

describe("isCurrentPeriodRow", () => {
  it("is true when viewing today and the sequence matches", () => {
    expect(isCurrentPeriodRow(true, 5, 5)).toBe(true);
  });

  it("is false when not viewing today", () => {
    expect(isCurrentPeriodRow(false, 5, 5)).toBe(false);
  });

  it("is false when the sequence does not match", () => {
    expect(isCurrentPeriodRow(true, 5, 6)).toBe(false);
  });

  it("is false when there is no period in session right now", () => {
    expect(isCurrentPeriodRow(true, 5, undefined)).toBe(false);
  });
});

describe("isNowWithinBlock", () => {
  it("is true for a single-period block matching the current sequence", () => {
    expect(isNowWithinBlock(3, 3, 3)).toBe(true);
  });

  it("is true anywhere inside a multi-period block's span, not only its first period", () => {
    expect(isNowWithinBlock(2, 4, 2)).toBe(true);
    expect(isNowWithinBlock(2, 4, 3)).toBe(true);
    expect(isNowWithinBlock(2, 4, 4)).toBe(true);
  });

  it("is false outside the block's span", () => {
    expect(isNowWithinBlock(2, 4, 1)).toBe(false);
    expect(isNowWithinBlock(2, 4, 5)).toBe(false);
  });

  it("is false when there is no period in session right now", () => {
    expect(isNowWithinBlock(2, 4, undefined)).toBe(false);
  });
});
