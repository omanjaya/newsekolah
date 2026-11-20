import { describe, expect, it } from "vitest";

import { counselingAccess, counselingTabs } from "./counseling-access";

const role = (slug: string) => ({ id: slug, slug, name: slug, is_primary: true });

describe("counselingAccess and counselingTabs", () => {
  it("gives a duty counselor their notes and the BK team's", () => {
    const access = counselingAccess({
      permissions: ["manage_counseling"],
      roles: [role("teacher")],
      duties: [{ slug: "counselor" }],
    });
    expect(access).toEqual({
      canWrite: true,
      canRead: true,
      isCounselor: true,
      isLeadership: false,
    });
    expect(counselingTabs(access)).toEqual(["mine", "bkTeam"]);
  });

  it("keeps an admin, who is no counselor, off the BK team list", () => {
    const access = counselingAccess({
      permissions: ["manage_counseling", "view_counseling"],
      roles: [role("admin")],
      duties: [],
    });
    expect(counselingTabs(access)).toEqual(["mine"]);
  });

  it("gives the principal, who holds no duty, the notes shared with leadership", () => {
    const access = counselingAccess({
      permissions: ["view_counseling"],
      roles: [role("principal")],
    });
    expect(access.isLeadership).toBe(true);
    expect(access.canWrite).toBe(false);
    expect(counselingTabs(access)).toEqual(["leadership"]);
  });

  it("gives the leadership duty the same list", () => {
    const access = counselingAccess({
      permissions: ["view_counseling"],
      roles: [role("teacher")],
      duties: [{ slug: "leadership" }],
    });
    expect(counselingTabs(access)).toEqual(["leadership"]);
  });

  it("offers nothing to a reader without either permission", () => {
    const access = counselingAccess({ permissions: [], roles: [role("teacher")] });
    expect(access.canRead).toBe(false);
    expect(counselingTabs(access)).toEqual([]);
  });
});
