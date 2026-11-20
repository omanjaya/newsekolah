import { describe, expect, it } from "vitest";

import {
  blockActiveOn,
  cellDate,
  defaultEffectiveFrom,
  earlierDate,
  inWeek,
  nearestSchoolDay,
  startOfIsoWeek,
  stepSchoolDay,
  weekDates,
} from "./week";

describe("startOfIsoWeek", () => {
  it("is the Monday of the week, with Sunday closing the week before", () => {
    expect(startOfIsoWeek("2026-11-20")).toBe("2026-11-16");
    expect(startOfIsoWeek("2026-11-16")).toBe("2026-11-16");
    expect(startOfIsoWeek("2026-11-22")).toBe("2026-11-16");
    expect(startOfIsoWeek("2027-01-01")).toBe("2026-12-28");
  });
});

describe("weekDates and cellDate", () => {
  it("lists Monday to Sunday and finds a weekday's date", () => {
    expect(weekDates("2026-11-30")).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
      "2026-12-06",
    ]);
    expect(cellDate("2026-11-30", 4)).toBe("2026-12-03");
    expect(inWeek("2026-11-30", "2026-12-06")).toBe(true);
    expect(inWeek("2026-11-30", "2026-12-07")).toBe(false);
  });
});

describe("blockActiveOn", () => {
  it("includes both bounds and leaves an open end open", () => {
    const block = { effective_from: "2026-07-16", effective_until: "2026-11-26" };
    expect(blockActiveOn(block, "2026-07-15")).toBe(false);
    expect(blockActiveOn(block, "2026-07-16")).toBe(true);
    expect(blockActiveOn(block, "2026-11-26")).toBe(true);
    expect(blockActiveOn(block, "2026-11-27")).toBe(false);
    expect(blockActiveOn({ effective_from: "2026-07-16" }, "2027-06-30")).toBe(true);
  });
});

describe("defaultEffectiveFrom", () => {
  const year = { yearStart: "2026-07-13", yearEnd: "2027-06-30" };

  it("never starts before today", () => {
    expect(defaultEffectiveFrom({ today: "2026-11-20", preferred: "2026-11-17", ...year })).toBe(
      "2026-11-20",
    );
  });

  it("starts on the date acted on when it is later", () => {
    expect(defaultEffectiveFrom({ today: "2026-11-20", preferred: "2026-11-26", ...year })).toBe(
      "2026-11-26",
    );
  });

  it("honours the server's earliest date for a block with history", () => {
    expect(defaultEffectiveFrom({ today: "2026-11-20", min: "2026-11-27", ...year })).toBe(
      "2026-11-27",
    );
  });

  it("starts with the year when today comes before it", () => {
    expect(defaultEffectiveFrom({ today: "2026-06-01", ...year })).toBe("2026-07-13");
  });

  it("stays inside the year", () => {
    expect(defaultEffectiveFrom({ today: "2027-07-10", ...year })).toBe("2027-06-30");
  });

  it("works without the year's dates", () => {
    expect(defaultEffectiveFrom({ today: "2026-11-20" })).toBe("2026-11-20");
  });
});

describe("school days", () => {
  const weekdays = [1, 2, 3, 4, 5];

  it("finds today or the next school day", () => {
    expect(nearestSchoolDay("2026-11-20", weekdays)).toBe("2026-11-20");
    expect(nearestSchoolDay("2026-11-21", weekdays)).toBe("2026-11-23");
    expect(nearestSchoolDay("2026-11-22", weekdays, -1)).toBe("2026-11-20");
    expect(nearestSchoolDay("2026-11-21", [])).toBe("2026-11-21");
  });

  it("steps over the days the school is closed", () => {
    expect(stepSchoolDay("2026-11-20", 1, weekdays)).toBe("2026-11-23");
    expect(stepSchoolDay("2026-11-23", -1, weekdays)).toBe("2026-11-20");
    expect(stepSchoolDay("2026-11-18", 1, weekdays)).toBe("2026-11-19");
    expect(stepSchoolDay("2026-11-21", 1, [1, 2, 3, 4, 5, 6])).toBe("2026-11-23");
  });

  it("picks the earlier of two dates", () => {
    expect(earlierDate("2027-06-30", "2026-12-03")).toBe("2026-12-03");
    expect(earlierDate("2027-06-30", undefined)).toBe("2027-06-30");
    expect(earlierDate(undefined, undefined)).toBeUndefined();
  });
});
