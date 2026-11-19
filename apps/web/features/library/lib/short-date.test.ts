import { describe, expect, it } from "vitest";

import { formatShortDate, formatShortDateRange, formatShortDayRange } from "./short-date";

const today = "2026-11-19";

describe("formatShortDateRange", () => {
  it("joins two different days with an en dash", () => {
    expect(formatShortDayRange("2026-11-12", "2026-11-19", "id", { today })).toBe(
      "12 Nov – 19 Nov",
    );
  });

  // A loan returned the day it was borrowed read "19 Nov – 19 Nov".
  it("prints a same-day span once", () => {
    expect(formatShortDayRange("2026-11-19", "2026-11-19", "id", { today })).toBe("19 Nov");
    expect(
      formatShortDateRange("2026-11-19T01:00:00Z", "2026-11-19T08:30:00Z", "id", {
        today,
        timeZone: "Asia/Jakarta",
      }),
    ).toBe("19 Nov");
  });
});

describe("formatShortDate", () => {
  // A loan borrowed at 04.34 on 19 Nov in Makassar (20.34 UTC on 18 Nov).
  const borrowedAt = "2026-11-18T20:34:33Z";

  it("places an instant on the school's calendar", () => {
    expect(formatShortDate(borrowedAt, "id", { timeZone: "Asia/Makassar", today })).toBe("19 Nov");
    expect(formatShortDate(borrowedAt, "id", { timeZone: "America/Los_Angeles", today })).toBe(
      "18 Nov",
    );
  });
});
