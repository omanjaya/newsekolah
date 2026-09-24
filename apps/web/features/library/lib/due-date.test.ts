import { describe, expect, it } from "vitest";

import { classifyDueDate, daysBetween, overdueDays } from "./due-date";

describe("daysBetween", () => {
  it("counts whole calendar days regardless of DST", () => {
    expect(daysBetween("2026-09-24", "2026-09-24")).toBe(0);
    expect(daysBetween("2026-09-24", "2026-09-26")).toBe(2);
    expect(daysBetween("2026-09-26", "2026-09-24")).toBe(-2);
  });

  it("crosses a month boundary correctly", () => {
    expect(daysBetween("2026-09-29", "2026-10-02")).toBe(3);
  });
});

describe("classifyDueDate", () => {
  it("is ok when several days remain", () => {
    expect(classifyDueDate("2026-10-05", "2026-09-24")).toBe("ok");
  });

  it("is dueSoon within the threshold, inclusive", () => {
    expect(classifyDueDate("2026-09-26", "2026-09-24")).toBe("dueSoon");
    expect(classifyDueDate("2026-09-24", "2026-09-24")).toBe("dueSoon");
  });

  it("is overdue once the due date has passed", () => {
    expect(classifyDueDate("2026-09-23", "2026-09-24")).toBe("overdue");
  });
});

describe("overdueDays", () => {
  it("is zero when not overdue", () => {
    expect(overdueDays("2026-09-30", "2026-09-24")).toBe(0);
    expect(overdueDays("2026-09-24", "2026-09-24")).toBe(0);
  });

  it("counts days past the due date", () => {
    expect(overdueDays("2026-09-20", "2026-09-24")).toBe(4);
  });
});
