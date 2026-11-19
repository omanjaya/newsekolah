import { describe, expect, it } from "vitest";

import {
  dayRangeInZone,
  endOfDayInZone,
  startOfDayInZone,
  isoToZonedLocal,
  zonedLocalToIso,
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
      to: "2026-11-14T16:59:59.999Z",
    });
  });

  it("follows the tenant's own offset, e.g. Asia/Makassar (UTC+8)", () => {
    expect(dayRangeInZone("2026-11-14", "2026-11-14", "Asia/Makassar").from).toBe(
      "2026-11-13T16:00:00.000Z",
    );
  });
});

describe("startOfDayInZone / endOfDayInZone", () => {
  it("bounds a single school day in the tenant's zone", () => {
    expect(startOfDayInZone("2026-11-18", "Asia/Makassar")).toBe("2026-11-17T16:00:00.000Z");
    expect(endOfDayInZone("2026-11-18", "Asia/Makassar")).toBe("2026-11-18T15:59:59.999Z");
  });

  it("ends the last day of a month on the right calendar day", () => {
    expect(endOfDayInZone("2026-11-30", "Asia/Jakarta")).toBe("2026-11-30T16:59:59.999Z");
  });
});

describe("zonedLocalToIso", () => {
  it("reads the picked wall clock in the school's zone, not the device's", () => {
    expect(zonedLocalToIso("2026-11-20T07:30", "Asia/Makassar")).toBe("2026-11-19T23:30:00.000Z");
    expect(zonedLocalToIso("2026-11-20T07:30", "Asia/Jakarta")).toBe("2026-11-20T00:30:00.000Z");
  });

  it("returns null for an empty or partial value", () => {
    expect(zonedLocalToIso("", "Asia/Makassar")).toBeNull();
    expect(zonedLocalToIso("2026-11-20", "Asia/Makassar")).toBeNull();
  });
});

describe("isoToZonedLocal", () => {
  it("shows a stored instant on the school's wall clock", () => {
    expect(isoToZonedLocal("2026-11-19T23:30:00Z", "Asia/Makassar")).toBe("2026-11-20T07:30");
  });

  it("round-trips with zonedLocalToIso", () => {
    const iso = zonedLocalToIso("2026-12-31T23:45", "Asia/Jayapura");
    expect(iso).not.toBeNull();
    expect(isoToZonedLocal(iso ?? "", "Asia/Jayapura")).toBe("2026-12-31T23:45");
  });

  it("returns an empty value for an invalid instant", () => {
    expect(isoToZonedLocal("not a date", "Asia/Makassar")).toBe("");
  });
});
