import { describe, expect, it } from "vitest";

import { exitPermitReadStatus } from "./exit-permit-status";

describe("exitPermitReadStatus", () => {
  it("reads a permit still on its way, or approved and unused, as expired once its lessons are over", () => {
    expect(exitPermitReadStatus("in_progress", true)).toBe("expired");
    expect(exitPermitReadStatus("approved", true)).toBe("expired");
  });

  it("keeps an open permit's status while its lessons last", () => {
    expect(exitPermitReadStatus("in_progress", false)).toBe("in_progress");
    expect(exitPermitReadStatus("approved", false)).toBe("approved");
  });

  it("keeps the end of a permit that is already closed", () => {
    for (const status of ["completed", "cancelled", "rejected", "expired"] as const) {
      expect(exitPermitReadStatus(status, true)).toBe(status);
    }
  });
});
