import { describe, expect, it } from "vitest";

import {
  endAfterStartChange,
  endPeriodOptions,
  lessonPeriodOptions,
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

describe("endPeriodOptions", () => {
  const options = lessonPeriodOptions(periods, "id");

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
