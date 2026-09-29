import { describe, expect, it } from "vitest";

import { deriveSessionCardAction } from "./session-card-action";

describe("deriveSessionCardAction", () => {
  it("is the primary fill action for the running, unsubmitted session", () => {
    expect(deriveSessionCardAction("empty", "ongoing")).toBe("fill");
  });

  it("is the secondary open action for an unsubmitted session that is not running", () => {
    expect(deriveSessionCardAction("empty", "next")).toBe("open");
    expect(deriveSessionCardAction("empty", null)).toBe("open");
  });

  it("is the saved badge for any submitted session, regardless of timing", () => {
    expect(deriveSessionCardAction("saved", "ongoing")).toBe("saved");
    expect(deriveSessionCardAction("saved", "next")).toBe("saved");
    expect(deriveSessionCardAction("saved", null)).toBe("saved");
    expect(deriveSessionCardAction("locked", null)).toBe("saved");
  });
});
