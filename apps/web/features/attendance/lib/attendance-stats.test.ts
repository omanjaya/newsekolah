import { describe, expect, it } from "vitest";

import { monthAttendanceStats } from "./attendance-stats";

const TODAY = "2026-09-25";

function day(date: string, statusCode: string) {
  return { date, status_code: statusCode };
}

describe("monthAttendanceStats", () => {
  it("computes the present rate over known days up to today, same rule as the dashboard tile", () => {
    const days = [
      day("2026-09-01", "H"),
      day("2026-09-02", "H"),
      day("2026-09-03", "S"),
      day("2026-09-04", "A"),
    ];
    const stats = monthAttendanceStats(days, TODAY);
    expect(stats.presentRate).toBe(50);
  });

  it("excludes future days and days without a schedule (NONE) from every count", () => {
    const days = [
      day("2026-09-20", "H"),
      day("2026-09-21", "NONE"), // weekend / no schedule
      day("2026-09-28", "H"), // future
    ];
    const stats = monthAttendanceStats(days, TODAY);
    expect(stats.presentRate).toBe(100);
    expect(stats.counts).toEqual({ H: 1 });
  });

  it("tallies sakit, izin, alpha and dispensasi separately, never folding dispensasi into izin", () => {
    const days = [
      day("2026-09-01", "H"),
      day("2026-09-02", "S"),
      day("2026-09-03", "I"),
      day("2026-09-04", "D"),
      day("2026-09-05", "A"),
      day("2026-09-06", "I"),
    ];
    const stats = monthAttendanceStats(days, TODAY);
    expect(stats.counts).toEqual({ H: 1, S: 1, I: 2, D: 1, A: 1 });
  });

  it("returns an undefined rate and empty counts when there is no known day yet", () => {
    const stats = monthAttendanceStats([], TODAY);
    expect(stats.presentRate).toBeUndefined();
    expect(stats.counts).toEqual({});
  });

  it("keeps INCOMPLETE and MIXED in the counts for the legend, apart from the four tile codes", () => {
    const days = [day("2026-09-01", "INCOMPLETE"), day("2026-09-02", "MIXED")];
    const stats = monthAttendanceStats(days, TODAY);
    expect(stats.counts).toEqual({ INCOMPLETE: 1, MIXED: 1 });
  });
});
