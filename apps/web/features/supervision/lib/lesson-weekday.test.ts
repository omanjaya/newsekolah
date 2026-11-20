import { describe, expect, it } from "vitest";

import { isoWeekdayOf } from "./lesson-weekday";

describe("isoWeekdayOf", () => {
  it("numbers Monday 1 through Sunday 7", () => {
    expect(isoWeekdayOf("2026-11-23")).toBe(1);
    expect(isoWeekdayOf("2026-11-20")).toBe(5);
    expect(isoWeekdayOf("2026-11-22")).toBe(7);
  });

  it("has no weekday for an empty or malformed date", () => {
    expect(isoWeekdayOf("")).toBeUndefined();
    expect(isoWeekdayOf("20/11/2026")).toBeUndefined();
  });
});
