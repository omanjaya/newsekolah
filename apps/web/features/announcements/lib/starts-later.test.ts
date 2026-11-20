import { describe, expect, it } from "vitest";

import { startsLater } from "./starts-later";

const now = new Date("2026-11-13T08:00:00Z");

describe("startsLater", () => {
  it("is true only for a start after now", () => {
    expect(startsLater({ starts_at: "2026-11-13T08:01:00Z" }, now)).toBe(true);
    expect(startsLater({ starts_at: "2026-11-13T08:00:00Z" }, now)).toBe(false);
    expect(startsLater({ starts_at: "2026-11-13T07:00:00Z" }, now)).toBe(false);
  });

  it("is false without a start", () => {
    expect(startsLater({ starts_at: undefined }, now)).toBe(false);
  });
});
