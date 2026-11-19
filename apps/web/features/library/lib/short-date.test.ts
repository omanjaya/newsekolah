import { describe, expect, it } from "vitest";

import { formatShortDateRange } from "./short-date";

const today = "2026-11-19";

describe("formatShortDateRange", () => {
  it("joins two different days with an en dash", () => {
    expect(formatShortDateRange("2026-11-12", "2026-11-19", "id", { today })).toBe(
      "12 Nov – 19 Nov",
    );
  });

  // A loan returned the day it was borrowed read "19 Nov – 19 Nov".
  it("prints a same-day span once", () => {
    expect(formatShortDateRange("2026-11-19", "2026-11-19", "id", { today })).toBe("19 Nov");
    expect(
      formatShortDateRange("2026-11-19T01:00:00Z", "2026-11-19T08:30:00Z", "id", {
        today,
        timeZone: "Asia/Jakarta",
      }),
    ).toBe("19 Nov");
  });
});
