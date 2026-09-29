import { describe, expect, it } from "vitest";

import { formatPeriodTime, periodSpan } from "./period-span";

describe("formatPeriodTime", () => {
  it("keeps only HH:MM from each HH:MM:SS timestamp", () => {
    expect(formatPeriodTime({ starts_at: "07:00:00", ends_at: "07:45:00" })).toBe("07:00-07:45");
  });

  it("handles a period that starts and ends on the hour", () => {
    expect(formatPeriodTime({ starts_at: "13:00:00", ends_at: "14:00:00" })).toBe("13:00-14:00");
  });
});

describe("periodSpan", () => {
  it("is 1 for a single-period block", () => {
    expect(periodSpan({ start_seq: 3, end_seq: 3 })).toBe(1);
  });

  it("counts every period the block runs through, inclusive", () => {
    expect(periodSpan({ start_seq: 2, end_seq: 4 })).toBe(3);
  });

  it("clamps to 1 rather than producing a zero or negative span", () => {
    expect(periodSpan({ start_seq: 5, end_seq: 4 })).toBe(1);
    expect(periodSpan({ start_seq: 5, end_seq: 2 })).toBe(1);
  });
});
