import { describe, expect, it } from "vitest";

import { formatShortWeekdayDate } from "./permit-dates";

describe("formatShortWeekdayDate", () => {
  // 02:00 UTC is 10:00 on Wednesday 18 November in Makassar.
  const at = "2026-11-18T02:00:00Z";

  // At 320px "Kam, 19 Nov 2026" was cut to "Kam, 19 Nov …".
  it("drops the year inside the school's current year", () => {
    expect(formatShortWeekdayDate(at, "id", "Asia/Makassar", "2026-11-19")).toBe("Rab, 18 Nov");
  });

  it("keeps the year outside the current year or without a today", () => {
    expect(formatShortWeekdayDate(at, "id", "Asia/Makassar", "2027-01-04")).toBe(
      "Rab, 18 Nov 2026",
    );
    expect(formatShortWeekdayDate(at, "id", "Asia/Makassar")).toBe("Rab, 18 Nov 2026");
  });

  it("reads the year in the school's zone, not UTC", () => {
    // 17:30 UTC on 31 December is already 1 January in Jakarta.
    expect(formatShortWeekdayDate("2026-12-31T17:30:00Z", "id", "Asia/Jakarta", "2027-01-01")).toBe(
      "Jum, 1 Jan",
    );
  });
});
