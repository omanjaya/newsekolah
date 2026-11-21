import { describe, expect, it } from "vitest";

import { memberBorrowBlock, runningSuspension, shownMemberStatus } from "./member-borrowing";

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
    ).toEqual({
      kind: "suspended",
      until: "2026-12-07",
      borrowFrom: "2026-12-08",
      membershipEnds: null,
    });
    expect(
      memberBorrowBlock({ status: "suspended", suspended_until: "2026-12-04" }, today),
    ).toEqual({
      kind: "suspended",
      until: "2026-12-04",
      borrowFrom: "2026-12-05",
      membershipEnds: null,
    });
  });

  it("carries the next day across a month end", () => {
    expect(
      memberBorrowBlock({ status: "suspended", suspended_until: "2026-12-31" }, "2026-12-30"),
    ).toEqual({
      kind: "suspended",
      until: "2026-12-31",
      borrowFrom: "2027-01-01",
      membershipEnds: null,
    });
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
      membershipEnds: null,
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

  // A suspension through 7 Dec with a membership valid through 30 Nov: on
  // 4 Dec the page promised borrowing again from 8 Dec, a day the desk
  // would refuse as an expired membership.
  it("reports an ended membership first, even while a suspension runs", () => {
    expect(
      memberBorrowBlock(
        { status: "suspended", suspended_until: "2026-12-07", valid_until: "2026-11-30" },
        today,
      ),
    ).toEqual({ kind: "expired", until: "2026-11-30" });
    expect(memberBorrowBlock({ status: "suspended", valid_until: "2026-11-30" }, today)).toEqual({
      kind: "expired",
      until: "2026-11-30",
    });
  });

  it("promises no borrow-again day the membership does not reach", () => {
    expect(
      memberBorrowBlock(
        { status: "suspended", suspended_until: "2026-12-07", valid_until: "2026-12-05" },
        today,
      ),
    ).toEqual({
      kind: "suspended",
      until: "2026-12-07",
      borrowFrom: null,
      membershipEnds: "2026-12-05",
    });
    // Valid through the suspension's last day only: the day after is already out.
    expect(
      memberBorrowBlock(
        { status: "suspended", suspended_until: "2026-12-07", valid_until: "2026-12-07" },
        today,
      ),
    ).toEqual({
      kind: "suspended",
      until: "2026-12-07",
      borrowFrom: null,
      membershipEnds: "2026-12-07",
    });
    // Valid on the day borrowing resumes: the day is promised.
    expect(
      memberBorrowBlock(
        { status: "suspended", suspended_until: "2026-12-07", valid_until: "2026-12-08" },
        today,
      ),
    ).toEqual({
      kind: "suspended",
      until: "2026-12-07",
      borrowFrom: "2026-12-08",
      membershipEnds: null,
    });
  });

  it("blocks a pending, inactive or cleared membership", () => {
    for (const status of ["pending", "inactive", "cleared"] as const) {
      expect(memberBorrowBlock({ status }, today)).toEqual({ kind: "inactive" });
    }
  });
});

// The staff screens name a suspension the server still refuses on, even
// once memberBorrowBlock reports the ended membership first.
describe("runningSuspension", () => {
  const today = "2026-12-04";

  it("keeps a running suspension although the membership has already ended", () => {
    expect(
      runningSuspension(
        { status: "suspended", suspended_until: "2026-12-07", valid_until: "2026-11-30" },
        today,
      ),
    ).toEqual({ until: "2026-12-07", borrowFrom: null, membershipEnds: "2026-11-30" });
    expect(runningSuspension({ status: "suspended", valid_until: "2026-11-30" }, today)).toEqual({
      until: null,
      borrowFrom: null,
      membershipEnds: null,
    });
  });

  it("promises the day after the last day while the membership reaches it", () => {
    expect(
      runningSuspension(
        { status: "suspended", suspended_until: "2026-12-07", valid_until: "2026-12-08" },
        today,
      ),
    ).toEqual({ until: "2026-12-07", borrowFrom: "2026-12-08", membershipEnds: null });
    expect(
      runningSuspension({ status: "suspended", suspended_until: "2026-12-04" }, today),
    ).toEqual({ until: "2026-12-04", borrowFrom: "2026-12-05", membershipEnds: null });
  });

  it("is null once the last day has passed, and for any other status", () => {
    expect(
      runningSuspension(
        { status: "suspended", suspended_until: "2026-12-03", valid_until: "2026-11-30" },
        today,
      ),
    ).toBeNull();
    for (const status of ["active", "pending", "inactive", "cleared"] as const) {
      expect(runningSuspension({ status, suspended_until: "2026-12-07" }, today)).toBeNull();
    }
  });
});

describe("shownMemberStatus", () => {
  it("shows a suspension whose last day has passed as active", () => {
    expect(
      shownMemberStatus({ status: "suspended", suspended_until: "2026-12-07" }, "2026-12-08"),
    ).toBe("active");
  });

  it("keeps a running or open-ended suspension, and every other status", () => {
    expect(
      shownMemberStatus({ status: "suspended", suspended_until: "2026-12-07" }, "2026-12-07"),
    ).toBe("suspended");
    expect(shownMemberStatus({ status: "suspended" }, "2027-01-01")).toBe("suspended");
    expect(
      shownMemberStatus({ status: "inactive", suspended_until: "2026-12-07" }, "2026-12-08"),
    ).toBe("inactive");
  });
});
