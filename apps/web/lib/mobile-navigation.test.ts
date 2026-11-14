import { describe, expect, it } from "vitest";

import { mobileNavigation } from "./mobile-navigation";
import { navigation } from "./navigation";
import { filterNavigationFixture } from "./navigation-access.fixture";
import { consolidateNavigation } from "./navigation-workspaces";

describe("mobile daily destinations", () => {
  it("only selects existing authorized staff routes", () => {
    const permitted = filterNavigationFixture(
      navigation,
      (permission) => permission === "manage_library_circulation",
      "staff",
    );
    expect(mobileNavigation(permitted, "staff").map((item) => item.key)).toContain("library-desk");
    expect(mobileNavigation(permitted, "staff").every((item) => permitted.includes(item))).toBe(
      true,
    );
  });
  it("gives an admin account (view_users, view_schedules) its office shortcuts, not the gate-duty pair", () => {
    const permitted = filterNavigationFixture(
      navigation,
      (permission) => ["view_users", "view_schedules", "issue_scan_tokens"].includes(permission),
      "staff",
    );
    const keys = mobileNavigation(permitted, "staff").map((item) => item.key);
    // The office's day: the approval queue and the accounts, not the timetable.
    expect(keys).toContain("school-users");
    expect(keys).toContain("inbox");
    expect(keys).not.toContain("exit-permits");
    expect(keys).not.toContain("duty");
  });
  it("gives gate-duty staff without view_users the visitor board and the scanner", () => {
    const permitted = filterNavigationFixture(
      navigation,
      (permission) => ["scan_exit_permits", "view_visitors"].includes(permission),
      "staff",
    );
    const keys = mobileNavigation(permitted, "staff").map((item) => item.key);
    expect(keys).toContain("scan");
    expect(keys).toContain("visitors-board");
    expect(keys).not.toContain("school-users");
  });
  it("gives a student their schedule and the scanner, not the occasional exit permit", () => {
    const permitted = filterNavigationFixture(
      navigation,
      (permission) => permission === "view_schedules",
      "student",
    );
    const keys = mobileNavigation(permitted, "student").map((item) => item.key);
    expect(keys).toContain("schedule");
    expect(keys).toContain("scan");
    expect(keys).not.toContain("exit-permits");
  });
  it("gives a counselor duty (guru BK) the action inbox and counseling instead of an empty teaching schedule", () => {
    // A counselor is seeded with the "teacher" profile kind and the base
    // teacher role's manage_attendance/view_schedules, same as any teacher,
    // plus their counselor duty's issue_leave_letters and manage_counseling
    // (apps/api's authz.DutyTypeDefaults), but usually holds no teaching
    // assignment, so attendance/schedule stay empty for them all day.
    const permitted = filterNavigationFixture(
      navigation,
      (permission) =>
        [
          "manage_attendance",
          "view_schedules",
          "manage_counseling",
          "issue_leave_letters",
        ].includes(permission),
      "teacher",
    );
    const keys = mobileNavigation(permitted, "teacher").map((item) => item.key);
    expect(keys).toContain("inbox");
    expect(keys).toContain("counseling");
    expect(keys).not.toContain("attendance");
    expect(keys).not.toContain("schedule");
  });
  it("gives a duty teacher (guru piket) the duty desk and the scanner ahead of teaching", () => {
    // Every teacher may show a class QR (issue_scan_tokens), so the duty
    // desk alone does not mark picket duty; the duty itself does.
    const permitted = filterNavigationFixture(
      navigation,
      (permission) =>
        ["manage_attendance", "view_schedules", "view_attendance", "issue_scan_tokens"].includes(
          permission,
        ),
      "teacher",
    );
    const keys = mobileNavigation(permitted, "teacher", [{ slug: "picket" }]).map(
      (item) => item.key,
    );
    expect(keys).toEqual(["dashboard", "duty", "scan", "attendance"]);
  });
  it("keeps a teacher who only may show a class QR on teaching", () => {
    const can = (permission: string) =>
      ["manage_attendance", "view_schedules", "view_attendance", "issue_scan_tokens"].includes(
        permission,
      );
    const items = consolidateNavigation(filterNavigationFixture(navigation, can, "teacher"), {
      profileKind: "teacher",
      can,
    });
    const keys = mobileNavigation(items, "teacher").map((item) => item.key);
    expect(keys.slice(0, 3)).toEqual(["dashboard", "attendance", "schedule"]);
    expect(keys).not.toContain("duty");
  });
  it("gives gate duty (satpam) the scanner, the visitor book and exit permits", () => {
    const permitted = filterNavigationFixture(
      navigation,
      (permission) =>
        ["scan_exit_permits", "view_visitors", "issue_scan_tokens", "view_academic_data"].includes(
          permission,
        ),
      "staff",
    );
    const keys = mobileNavigation(permitted, "staff", [{ slug: "security" }]).map(
      (item) => item.key,
    );
    expect(keys.slice(0, 3)).toEqual(["dashboard", "scan", "visitors-board"]);
  });
  it("gives a librarian the circulation desk and the catalogue, not the timetable", () => {
    const permitted = filterNavigationFixture(
      navigation,
      (permission) =>
        [
          "manage_library_circulation",
          "manage_library_catalogue",
          "manage_library_members",
          "view_schedules",
        ].includes(permission),
      "staff",
    );
    const keys = mobileNavigation(permitted, "staff", [{ slug: "librarian" }]).map(
      (item) => item.key,
    );
    expect(keys[1]).toBe("library-desk");
    expect(keys).not.toContain("schedule");
  });
  it("gives school leadership the queue, the reports and attendance", () => {
    const can = (permission: string) =>
      [
        "view_staff_attendance",
        "view_reports",
        "view_attendance",
        "review_leave_requests",
        "view_schedules",
      ].includes(permission);
    const items = consolidateNavigation(filterNavigationFixture(navigation, can, "teacher"), {
      profileKind: "teacher",
      can,
    });
    const keys = mobileNavigation(items, "teacher").map((item) => item.key);
    expect(keys).toEqual(["dashboard", "inbox", "reports", "attendance"]);
  });
  it("never offers more than Beranda and three daily destinations", () => {
    const permitted = filterNavigationFixture(navigation, () => true, "staff");
    expect(mobileNavigation(permitted, "staff").length).toBeLessThanOrEqual(4);
  });
  it("gives a homeroom teacher attendance and the action inbox", () => {
    const can = (permission: string) =>
      ["manage_attendance", "view_schedules", "view_attendance"].includes(permission);
    const items = consolidateNavigation(filterNavigationFixture(navigation, can, "teacher"), {
      profileKind: "teacher",
      duties: [{ slug: "homeroom" }],
      can,
    });
    const keys = mobileNavigation(items, "teacher").map((item) => item.key);
    expect(keys).toEqual(["dashboard", "attendance", "inbox", "schedule"]);
  });
  it("keeps a plain teacher on attendance and schedule", () => {
    const can = (permission: string) =>
      ["manage_attendance", "view_schedules", "view_attendance"].includes(permission);
    const items = consolidateNavigation(filterNavigationFixture(navigation, can, "teacher"), {
      profileKind: "teacher",
      can,
    });
    const keys = mobileNavigation(items, "teacher").map((item) => item.key);
    expect(keys).toEqual(["dashboard", "attendance", "schedule", "profile"]);
  });
});
