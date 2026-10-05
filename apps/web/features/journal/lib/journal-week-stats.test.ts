import { describe, expect, it } from "vitest";

import type { LessonDayGroup } from "./build-lesson-days";
import { computeJournalWeekStats } from "./journal-week-stats";

describe("computeJournalWeekStats", () => {
  it("returns zero for an empty window", () => {
    expect(computeJournalWeekStats([], "2026-09-23")).toEqual({
      filledThisWeek: 0,
      missingToday: 0,
    });
  });

  it("counts every filled lesson across the window as the week total", () => {
    const groups: LessonDayGroup[] = [
      {
        date: "2026-09-23",
        lessons: [
          { scheduleId: "a", classId: "c1", subjectId: "s1", filled: true },
          { scheduleId: "b", classId: "c2", subjectId: "s2", filled: false },
        ],
      },
      {
        date: "2026-09-21",
        lessons: [{ scheduleId: "c", classId: "c1", subjectId: "s1", filled: true }],
      },
    ];
    expect(computeJournalWeekStats(groups, "2026-09-23").filledThisWeek).toBe(2);
  });

  it("counts an unfilled lesson toward missingToday only when its date is today", () => {
    const groups: LessonDayGroup[] = [
      {
        date: "2026-09-23",
        lessons: [{ scheduleId: "a", classId: "c1", subjectId: "s1", filled: false }],
      },
      {
        date: "2026-09-21",
        lessons: [{ scheduleId: "b", classId: "c2", subjectId: "s2", filled: false }],
      },
    ];
    expect(computeJournalWeekStats(groups, "2026-09-23")).toEqual({
      filledThisWeek: 0,
      missingToday: 1,
    });
  });

  it("does not double count: a lesson is either filled or (if today) missing, never both", () => {
    const groups: LessonDayGroup[] = [
      {
        date: "2026-09-23",
        lessons: [{ scheduleId: "a", classId: "c1", subjectId: "s1", filled: true }],
      },
    ];
    expect(computeJournalWeekStats(groups, "2026-09-23")).toEqual({
      filledThisWeek: 1,
      missingToday: 0,
    });
  });
});
