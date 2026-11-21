import { describe, expect, it } from "vitest";

import { memberBorrowBlock } from "./member-borrowing";

// The same cases as domain.Member.EligibleToBorrow on the server
// (apps/api/internal/modules/library/domain/members.go).
describe("memberBorrowBlock", () => {
  const today = "2026-12-04";

  it("lets an active member with a valid membership borrow", () => {
    expect(memberBorrowBlock({ status: "active", valid_until: "2027-06-30" }, today)).toBeNull();
    expect(memberBorrowBlock({ status: "active" }, today)).toBeNull();
  });

  it("blocks a suspended member through the suspension's last day", () => {
    expect(
      memberBorrowBlock({ status: "suspended", suspended_until: "2026-12-07" }, today),
    ).toEqual({ kind: "suspended", until: "2026-12-07", borrowFrom: "2026-12-08" });
    expect(
      memberBorrowBlock({ status: "suspended", suspended_until: "2026-12-04" }, today),
    ).toEqual({ kind: "suspended", until: "2026-12-04", borrowFrom: "2026-12-05" });
  });

  it("carries the next day across a month end", () => {
    expect(
      memberBorrowBlock({ status: "suspended", suspended_until: "2026-12-31" }, "2026-12-30"),
    ).toEqual({ kind: "suspended", until: "2026-12-31", borrowFrom: "2027-01-01" });
  });

  it("treats a suspension whose end date has passed as over", () => {
    expect(
      memberBorrowBlock({ status: "suspended", suspended_until: "2026-12-03" }, today),
    ).toBeNull();
  });

  it("blocks a suspension with no end date until staff lift it", () => {
    expect(memberBorrowBlock({ status: "suspended" }, today)).toEqual({
      kind: "suspended",
      until: null,
      borrowFrom: null,
    });
  });

  it("still checks the membership's validity once a suspension is over", () => {
    expect(
      memberBorrowBlock(
        { status: "suspended", suspended_until: "2026-11-30", valid_until: "2026-12-01" },
        today,
      ),
    ).toEqual({ kind: "expired", until: "2026-12-01" });
  });

  it("blocks an expired membership the day after valid_until, not on it", () => {
    expect(memberBorrowBlock({ status: "active", valid_until: "2026-12-04" }, today)).toBeNull();
    expect(memberBorrowBlock({ status: "active", valid_until: "2026-12-03" }, today)).toEqual({
      kind: "expired",
      until: "2026-12-03",
    });
  });

  it("blocks a pending, inactive or cleared membership", () => {
    for (const status of ["pending", "inactive", "cleared"] as const) {
      expect(memberBorrowBlock({ status }, today)).toEqual({ kind: "inactive" });
    }
  });
});
