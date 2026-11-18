import { describe, expect, it } from "vitest";

import { clockLabel, clockRange } from "./clock-label";

describe("clockLabel", () => {
  it("writes Indonesian clock times with a dot", () => {
    expect(clockLabel("07:00:00", "id")).toBe("07.00");
  });

  it("keeps the colon in English", () => {
    expect(clockLabel("07:45", "en")).toBe("07:45");
  });
});

describe("clockRange", () => {
  it("joins two times with a spaced en dash", () => {
    expect(clockRange("07:00:00", "08:30:00", "id")).toBe("07.00 – 08.30");
  });
});
