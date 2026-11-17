import { describe, expect, it } from "vitest";

import { joinInstant, splitInstant } from "./instant";

describe("splitInstant and joinInstant", () => {
  it("round-trips an instant through the school's date and wall clock", () => {
    const instant = new Date("2026-11-13T23:30:00Z");
    const parts = splitInstant(instant, "Asia/Jakarta");
    expect(parts).toEqual({ date: "2026-11-14", time: "06:30" });
    expect(joinInstant(parts.date, parts.time, "Asia/Jakarta")?.toISOString()).toBe(
      "2026-11-13T23:30:00.000Z",
    );
  });

  it("has no instant while the date or the time is empty", () => {
    expect(joinInstant("", "06:30", "Asia/Jakarta")).toBeNull();
    expect(joinInstant("2026-11-14", "", "Asia/Jakarta")).toBeNull();
  });
});
