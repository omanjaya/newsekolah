import { describe, expect, it } from "vitest";

import { formatDayRange } from "./activity-dates";
import { clubScheduleLabel } from "./club-schedule";

const weekday = (key: string) => ({ friday: "Jumat", monday: "Senin" })[key] ?? key;

describe("clubScheduleLabel", () => {
  it("reads a day and its times as a school's timetable does", () => {
    expect(
      clubScheduleLabel(
        { meeting_day: 5, meeting_start: "15:00", meeting_end: "16:30" },
        weekday,
        "id",
      ),
    ).toBe("Jumat, 15.00 – 16.30");
  });

  it("keeps the day alone when no time is set, and nothing without a day", () => {
    expect(clubScheduleLabel({ meeting_day: 1 }, weekday, "id")).toBe("Senin");
    expect(clubScheduleLabel({}, weekday, "id")).toBeUndefined();
  });
});

describe("formatDayRange", () => {
  it("says a one-day event once and never as raw ISO dates", () => {
    expect(formatDayRange("2026-09-20", "2026-09-20", "en")).toBe("Sep 20, 2026");
    expect(formatDayRange("2026-09-20", "2026-09-21", "id")).not.toContain("2026-09");
  });
});
