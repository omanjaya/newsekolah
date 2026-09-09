import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatNumber, formatRelative, formatTime } from "./format.js";

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
});
