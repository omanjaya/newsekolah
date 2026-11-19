import { describe, expect, it } from "vitest";

import { formatPeriodTime, periodSpan, periodSpanLabel } from "./period-span";

describe("formatPeriodTime", () => {
  it("writes the span the Indonesian way, as every other time in the app", () => {
    expect(formatPeriodTime({ starts_at: "07:00:00", ends_at: "07:45:00" }, "id")).toBe(
      "07.00 – 07.45",
    );
  });

  it("keeps the colon in English", () => {
    expect(formatPeriodTime({ starts_at: "13:00:00", ends_at: "14:00:00" }, "en")).toBe(
      "13:00 – 14:00",
    );
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

describe("periodSpanLabel", () => {
  it("names one period on its own", () => {
    const first = { name: "Jam 1", sequence: 1 };
    expect(periodSpanLabel(first, first)).toBe("Jam 1");
  });

  it("names a block's first and last period when it spans several", () => {
    expect(periodSpanLabel({ name: "Jam 1", sequence: 1 }, { name: "Jam 3", sequence: 3 })).toBe(
      "Jam 1 – Jam 3",
    );
  });
});
