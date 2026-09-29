import { describe, expect, it } from "vitest";

import { nextLessonDate } from "./next-lesson-date";

describe("nextLessonDate", () => {
  it("uses the tenant's date and allows today's lesson", () => {
    expect(nextLessonDate("2026-09-29", 2)).toBe("2026-09-29");
  });
  it("rolls a passed weekday into the next week and month", () => {
    expect(nextLessonDate("2026-09-29", 1)).toBe("2026-10-05");
  });
  it("uses ISO Sunday and handles a year boundary", () => {
    expect(nextLessonDate("2026-12-31", 7)).toBe("2027-01-03");
  });
});
