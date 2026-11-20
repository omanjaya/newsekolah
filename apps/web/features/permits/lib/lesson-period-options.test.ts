import { describe, expect, it } from "vitest";

import {
  endAfterStartChange,
  endPeriodOptions,
  lessonEnded,
  lessonPeriodOptions,
  upcomingLessonPeriods,
} from "./lesson-period-options";

const periods = [
  { id: "p1", name: "Jam 1", starts_at: "07:00:00", ends_at: "07:45:00", is_break: false },
  { id: "b1", name: "Istirahat 1", starts_at: "07:45:00", ends_at: "08:00:00", is_break: true },
  { id: "p2", name: "Jam 2", starts_at: "08:00:00", ends_at: "08:45:00", is_break: false },
  { id: "p3", name: "Jam 3", starts_at: "08:45:00", ends_at: "09:30:00", is_break: false },
];

describe("lessonPeriodOptions", () => {
  it("leaves breaks out and shows each lesson's times", () => {
    expect(lessonPeriodOptions(periods, "id")).toEqual([
      { value: "p1", label: "Jam 1 (07.00 – 07.45)" },
      { value: "p2", label: "Jam 2 (08.00 – 08.45)" },
      { value: "p3", label: "Jam 3 (08.45 – 09.30)" },
    ]);
  });
});

describe("upcomingLessonPeriods", () => {
  it("drops the lessons that have already ended", () => {
    expect(upcomingLessonPeriods(periods, "08:10").map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("drops a lesson at the minute it ends, as the API does", () => {
    expect(upcomingLessonPeriods(periods, "07:45").map((p) => p.id)).toEqual(["b1", "p2", "p3"]);
    expect(upcomingLessonPeriods(periods, "07:44").map((p) => p.id)).toEqual([
      "p1",
      "b1",
      "p2",
      "p3",
    ]);
  });

  it("leaves nothing once the school day is over", () => {
    expect(upcomingLessonPeriods(periods, "11:30")).toEqual([]);
  });
});

describe("lessonEnded", () => {
  it("is true from the minute the lesson ends", () => {
    expect(lessonEnded({ ends_at: "08:45:00" }, "08:44")).toBe(false);
    expect(lessonEnded({ ends_at: "08:45:00" }, "08:45")).toBe(true);
  });
});

describe("endPeriodOptions", () => {
  const options = lessonPeriodOptions(periods, "id");

  // The API accepts a one-lesson range (start and end the same), so the
  // start stays on offer as an end: during the day's last lesson it is the
  // only range left.
  it("offers only the start lesson and those after it", () => {
    expect(endPeriodOptions(options, "p2").map((o) => o.value)).toEqual(["p2", "p3"]);
  });

  it("offers every lesson before a start is picked", () => {
    expect(endPeriodOptions(options, "").map((o) => o.value)).toEqual(["p1", "p2", "p3"]);
  });

  it("moves an end that now lies before the start onto the start", () => {
    expect(endAfterStartChange(options, "p3", "p2")).toBe("p3");
    expect(endAfterStartChange(options, "p1", "p3")).toBe("p3");
    expect(endAfterStartChange(options, "p2", "")).toBe("p2");
  });
});
