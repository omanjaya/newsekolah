import { describe, expect, it } from "vitest";

import {
  dayRangeInZone,
  endOfPreviousIsoMonth,
  shiftIsoDate,
  startOfIsoMonth,
  startOfPreviousIsoMonth,
} from "./tenant-date";

describe("shiftIsoDate", () => {
  it("shifts within the same month", () => {
    expect(shiftIsoDate("2026-09-15", -6)).toBe("2026-09-09");
  });

  it("crosses a month boundary", () => {
    expect(shiftIsoDate("2026-09-03", -6)).toBe("2026-08-28");
  });

  it("crosses a year boundary", () => {
    expect(shiftIsoDate("2026-01-02", -6)).toBe("2025-12-27");
  });
});

describe("startOfIsoMonth", () => {
  it("returns the 1st of the given date's month", () => {
    expect(startOfIsoMonth("2026-09-15")).toBe("2026-09-01");
  });
});

describe("startOfPreviousIsoMonth", () => {
  it("returns the 1st of the month before", () => {
    expect(startOfPreviousIsoMonth("2026-09-15")).toBe("2026-08-01");
  });

  it("crosses a year boundary from January", () => {
    expect(startOfPreviousIsoMonth("2026-01-15")).toBe("2025-12-01");
  });
});

describe("endOfPreviousIsoMonth", () => {
  it("returns the last day of the month before", () => {
    expect(endOfPreviousIsoMonth("2026-09-15")).toBe("2026-08-31");
  });

  it("handles a short February correctly", () => {
    expect(endOfPreviousIsoMonth("2026-03-01")).toBe("2026-02-28");
  });

  it("crosses a year boundary from January", () => {
    expect(endOfPreviousIsoMonth("2026-01-15")).toBe("2025-12-31");
  });
});

describe("dayRangeInZone", () => {
  it("starts the first day at the tenant's midnight, not UTC midnight", () => {
    // 00:00 in Asia/Jakarta (UTC+7) is 17:00 UTC the previous day.
    expect(dayRangeInZone("2026-11-13", "2026-11-14", "Asia/Jakarta")).toEqual({
      from: "2026-11-12T17:00:00.000Z",
      to: "2026-11-14T16:59:59.000Z",
    });
  });

  it("follows the tenant's own offset, e.g. Asia/Makassar (UTC+8)", () => {
    expect(dayRangeInZone("2026-11-14", "2026-11-14", "Asia/Makassar").from).toBe(
      "2026-11-13T16:00:00.000Z",
    );
  });
});
