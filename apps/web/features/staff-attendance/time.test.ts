import { describe, expect, it } from "vitest";

import { schoolClock, schoolInstant, shiftDateISO } from "./time";

describe("schoolClock and schoolInstant", () => {
  it("reads and writes times on the school's own clock", () => {
    expect(schoolClock("2026-11-14T00:05:00Z", "Asia/Jakarta")).toBe("07:05");
    expect(schoolInstant("2026-11-14", "07:05", "Asia/Jakarta")).toBe("2026-11-14T00:05:00.000Z");
  });

  it("has no time or instant for an empty value", () => {
    expect(schoolClock(null, "Asia/Jakarta")).toBe("");
    expect(schoolInstant("2026-11-14", "", "Asia/Jakarta")).toBeNull();
  });

  it("puts a night shift's departure on the next day", () => {
    expect(schoolInstant(shiftDateISO("2026-11-14", 1), "02:00", "Asia/Jakarta")).toBe(
      "2026-11-14T19:00:00.000Z",
    );
  });
});
