import { describe, expect, it } from "vitest";

import { buildLessonDays, isoWeekday, journalEntryKey, shiftDateISO } from "./build-lesson-days";

describe("shiftDateISO", () => {
  it("shifts across a month boundary", () => {
    expect(shiftDateISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateISO("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("isoWeekday", () => {
  it("returns 1 for Monday and 7 for Sunday", () => {
    // 2026-09-21 is a Monday.
    expect(isoWeekday("2026-09-21")).toBe(1);
    expect(isoWeekday("2026-09-27")).toBe(7);
  });
});

describe("buildLessonDays", () => {
  const monday: readonly {
    scheduleId: string;
    classId: string;
    subjectId: string;
    dayOfWeek: number;
  }[] = [
    { scheduleId: "sched-1", classId: "class-1", subjectId: "subject-1", dayOfWeek: 1 },
    { scheduleId: "sched-2", classId: "class-2", subjectId: "subject-2", dayOfWeek: 3 },
  ];
  const activeWeekdays = new Set([1, 2, 3, 4, 5]);

  it("skips days with no lesson at all, newest first", () => {
    // 2026-09-23 is a Wednesday; look back 3 days: Mon 21, Tue 22, Wed 23.
    const groups = buildLessonDays("2026-09-23", 3, activeWeekdays, monday, new Set());
    expect(groups.map((g) => g.date)).toEqual(["2026-09-23", "2026-09-21"]);
  });

  it("skips a day outside the active school-day set even if a block exists", () => {
    const groups = buildLessonDays("2026-09-21", 1, new Set([2, 3, 4, 5]), monday, new Set());
    expect(groups).toHaveLength(0);
  });

  it("marks a lesson filled from the caller's key set", () => {
    const filled = new Set([journalEntryKey("class-1", "subject-1", "2026-09-21")]);
    const groups = buildLessonDays("2026-09-21", 1, activeWeekdays, monday, filled);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.lessons).toEqual([
      { scheduleId: "sched-1", classId: "class-1", subjectId: "subject-1", filled: true },
    ]);
  });

  it("groups every lesson taught the same weekday under one date", () => {
    const twoOnMonday = [
      ...monday,
      { scheduleId: "sched-3", classId: "class-3", subjectId: "subject-3", dayOfWeek: 1 },
    ];
    const groups = buildLessonDays("2026-09-21", 1, activeWeekdays, twoOnMonday, new Set());
    expect(groups).toHaveLength(1);
    expect(groups[0]?.lessons).toHaveLength(2);
  });
});
