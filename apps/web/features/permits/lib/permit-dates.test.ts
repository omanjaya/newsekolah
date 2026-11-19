import { describe, expect, it } from "vitest";

import { formatShortWeekdayDate } from "./permit-dates";

describe("formatShortWeekdayDate", () => {
  // 02:00 UTC is 10:00 on Wednesday 18 November in Makassar.
  const at = "2026-11-18T02:00:00Z";

  // At 320px "Kam, 19 Nov 2026" was cut to "Kam, 19 Nov …".
  it("drops the year inside the school's current year", () => {
    expect(formatShortWeekdayDate(at, "id", "Asia/Makassar", "2026-11-19")).toBe("Rab, 18 Nov");
  });

  // A permit from last year (January to June, the first half of the school
  // year) read "Kam, 19 Nov..." at 320px: weekday and year do not both fit.
  it("keeps the year and drops the weekday outside the current year or without a today", () => {
    expect(formatShortWeekdayDate(at, "id", "Asia/Makassar", "2027-01-04")).toBe("18 Nov 2026");
    expect(formatShortWeekdayDate(at, "id", "Asia/Makassar")).toBe("18 Nov 2026");
    expect(formatShortWeekdayDate(at, "en", "Asia/Makassar", "2027-01-04")).toBe("18 Nov 2026");
  });

  it("is never longer with the year than the current-year form", () => {
    const current = formatShortWeekdayDate(at, "id", "Asia/Makassar", "2026-11-19");
    const prior = formatShortWeekdayDate(at, "id", "Asia/Makassar", "2027-03-01");
    expect(prior.length).toBeLessThanOrEqual(current.length);
  });

  it("reads the year in the school's zone, not UTC", () => {
    // 17:30 UTC on 31 December is already 1 January in Jakarta.
    expect(formatShortWeekdayDate("2026-12-31T17:30:00Z", "id", "Asia/Jakarta", "2027-01-01")).toBe(
      "Jum, 1 Jan",
    );
  });
});
