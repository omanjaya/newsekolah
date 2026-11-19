import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatShortDate,
  formatTime,
} from "./format.js";

const TZ = "Asia/Jakarta";
const SAMPLE = new Date("2026-09-09T07:05:00Z"); // 14.05 WIB

describe("formatDate", () => {
  it("formats a long Indonesian date", () => {
    expect(formatDate(SAMPLE, { locale: "id", timeZone: TZ })).toBe("9 September 2026");
  });
});

describe("formatTime", () => {
  it("formats 24-hour time for id", () => {
    expect(formatTime(SAMPLE, { locale: "id", timeZone: TZ })).toBe("14.05");
  });
});

describe("formatDateTime", () => {
  it("combines date and time", () => {
    expect(formatDateTime(SAMPLE, { locale: "id", timeZone: TZ })).toBe(
      "9 September 2026 pukul 14.05",
    );
  });
});

describe("formatRelative", () => {
  it("returns a relative string under 24 hours", () => {
    const now = new Date(SAMPLE.getTime() + 2 * 3600 * 1000);
    const result = formatRelative(SAMPLE, { locale: "id", timeZone: TZ, now });
    expect(result).toContain("2 jam");
  });

  it("falls back to an absolute date at 24 hours or more", () => {
    const now = new Date(SAMPLE.getTime() + 25 * 3600 * 1000);
    const result = formatRelative(SAMPLE, { locale: "id", timeZone: TZ, now });
    expect(result).toBe(formatDateTime(SAMPLE, { locale: "id", timeZone: TZ }));
  });
});

describe("formatNumber", () => {
  it("uses locale-specific grouping", () => {
    expect(formatNumber(12345, { locale: "id" })).toBe("12.345");
    expect(formatNumber(12345, { locale: "en" })).toBe("12,345");
  });

  it("writes a fixed number of decimals with the locale's separator", () => {
    expect(formatNumber(78.46, { locale: "id", fractionDigits: 1 })).toBe("78,5");
    expect(formatNumber(78.46, { locale: "en", fractionDigits: 1 })).toBe("78.5");
    expect(formatNumber(80, { locale: "id", fractionDigits: 1 })).toBe("80,0");
  });
});

// A school's dates have no time of day. Read at midnight in one zone and
// formatted in another, they slid to the day before (13 Jul showed as 12).
describe("calendar dates", () => {
  it("reads a date-only value as that day in any zone", () => {
    for (const timeZone of ["Asia/Makassar", "Asia/Jakarta", "UTC", "America/Los_Angeles"]) {
      expect(formatDate("2026-07-13", { locale: "id", timeZone })).toBe("13 Juli 2026");
    }
  });
});

describe("formatShortDate", () => {
  const now = new Date("2026-11-19T03:00:00Z");

  it("drops the year inside the current one", () => {
    expect(formatShortDate("2026-11-27", { locale: "id", timeZone: "Asia/Makassar", now })).toBe(
      "27 Nov",
    );
  });

  it("keeps the year outside the current one", () => {
    expect(formatShortDate("2027-01-03", { locale: "id", timeZone: "Asia/Makassar", now })).toBe(
      "3 Jan 2027",
    );
  });

  it("places an instant in the school's zone", () => {
    // 23.30 UTC on the 26th is already the 27th in Makassar (UTC+8).
    expect(
      formatShortDate("2026-11-26T23:30:00Z", { locale: "id", timeZone: "Asia/Makassar", now }),
    ).toBe("27 Nov");
  });

  // English rows read day first too, so a dashboard hint ("Due 1 Oct")
  // agrees with the library lists beside it.
  it("puts the day first in English as in Indonesian", () => {
    expect(formatShortDate("2026-10-01", { locale: "en", timeZone: "Asia/Makassar", now })).toBe(
      "1 Oct",
    );
  });

  it("reads the current year in the school's zone", () => {
    // 31 Dec 20.00 UTC is already New Year's Day in Jakarta.
    const newYear = new Date("2026-12-31T20:00:00Z");
    expect(
      formatShortDate("2027-01-03", { locale: "id", timeZone: "Asia/Jakarta", now: newYear }),
    ).toBe("3 Jan");
  });
});

describe("formatDateRange", () => {
  it("joins two calendar dates with an en dash, each on its own day", () => {
    const range = formatDateRange("2026-07-13", "2027-06-18", {
      locale: "id",
      timeZone: "Asia/Makassar",
    });
    expect(range).toMatch(/^13 Jul 2026\s–\s18 Jun 2027$/);
    expect(range).not.toContain("-");
  });

  it("says month and year once inside one month", () => {
    expect(formatDateRange("2026-07-13", "2026-07-20", { locale: "id", timeZone: TZ })).toBe(
      "13–20 Jul 2026",
    );
  });

  it("puts the day first in English", () => {
    // en-GB spaces its dash even inside one month.
    expect(formatDateRange("2026-07-13", "2026-07-20", { locale: "en", timeZone: TZ })).toMatch(
      /^13\s–\s20 Jul 2026$/,
    );
  });

  it("says a single day once", () => {
    expect(formatDateRange("2026-07-13", "2026-07-13", { locale: "id", timeZone: TZ })).toBe(
      "13 Jul 2026",
    );
  });
});
