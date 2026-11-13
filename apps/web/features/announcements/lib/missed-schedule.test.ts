import { describe, expect, it } from "vitest";

import { isMissedSchedule } from "./missed-schedule";

const now = new Date("2026-11-13T08:00:00Z");

describe("isMissedSchedule", () => {
  it("flags a draft whose start has passed", () => {
    expect(isMissedSchedule({ status: "draft", starts_at: "2026-11-13T07:00:00Z" }, now)).toBe(
      true,
    );
  });

  it("leaves a draft with a future start or none alone", () => {
    expect(isMissedSchedule({ status: "draft", starts_at: "2026-11-14T07:00:00Z" }, now)).toBe(
      false,
    );
    expect(isMissedSchedule({ status: "draft", starts_at: undefined }, now)).toBe(false);
  });

  it("never flags a scheduled, published or archived announcement", () => {
    for (const status of ["scheduled", "published", "archived"] as const) {
      expect(isMissedSchedule({ status, starts_at: "2026-11-13T07:00:00Z" }, now)).toBe(false);
    }
  });
});
