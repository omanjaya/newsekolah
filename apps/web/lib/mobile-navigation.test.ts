import { describe, expect, it } from "vitest";

import { mobileNavigation } from "./mobile-navigation";
import { filterNavigation, navigation } from "./navigation";

describe("mobile daily destinations", () => {
  it("gives parents child and leave destinations without unauthorized teacher controls", () => {
    const permitted = filterNavigation(
      navigation,
      (permission) => permission === "view_child_attendance",
      "parent",
    );
    const keys = mobileNavigation(permitted, "parent").map((item) => item.key);
    expect(keys).toContain("children");
    expect(keys).not.toContain("attendance");
    expect(keys.length).toBeLessThanOrEqual(4);
  });
  it("only selects existing authorized staff routes", () => {
    const permitted = filterNavigation(
      navigation,
      (permission) => permission === "manage_library_circulation",
      "staff",
    );
    expect(mobileNavigation(permitted, "staff").map((item) => item.key)).toContain("library-desk");
    expect(mobileNavigation(permitted, "staff").every((item) => permitted.includes(item))).toBe(
      true,
    );
  });
  it("gives a counselor duty (guru BK) the leave and counseling queues instead of an empty teaching schedule", () => {
    // A counselor is seeded with the "teacher" profile kind and the base
    // teacher role's manage_attendance/view_schedules, same as any teacher
    // (apps/api's authz.DutyTypeDefaults), but usually holds no teaching
    // assignment, so attendance/schedule stay empty for them all day.
    const permitted = filterNavigation(
      navigation,
      (permission) =>
        ["manage_attendance", "view_schedules", "manage_counseling"].includes(permission),
      "teacher",
    );
    const keys = mobileNavigation(permitted, "teacher").map((item) => item.key);
    expect(keys).toContain("leave-requests");
    expect(keys).toContain("counseling");
    expect(keys).not.toContain("attendance");
    expect(keys).not.toContain("schedule");
  });
});
