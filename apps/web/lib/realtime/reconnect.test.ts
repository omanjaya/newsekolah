import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_DELAY_MS, reconnectDelay } from "./reconnect";

describe("reconnectDelay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the low end of the jitter range when Math.random is 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(reconnectDelay(0)).toBe(500); // ceiling 1000, half-jitter floor
    expect(reconnectDelay(2)).toBe(2000); // ceiling 4000
  });

  it("never exceeds the ceiling even at the top of the jitter range", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(reconnectDelay(0)).toBeLessThanOrEqual(1000);
    expect(reconnectDelay(10)).toBeLessThanOrEqual(MAX_DELAY_MS);
  });

  it("caps the ceiling at MAX_DELAY_MS instead of growing without bound", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // Attempt 10 would be 1000 * 2**10 = 1,024,000ms uncapped; the ceiling
    // clamps it to MAX_DELAY_MS, so the floor is half of that (15000).
    expect(reconnectDelay(10)).toBe(MAX_DELAY_MS / 2);
    expect(reconnectDelay(20)).toBe(MAX_DELAY_MS / 2);
  });

  it("never returns 0 or a negative delay for any attempt", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    for (const attempt of [0, 1, 5, 50]) {
      expect(reconnectDelay(attempt)).toBeGreaterThan(0);
    }
  });
});
