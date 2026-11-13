import { describe, expect, it } from "vitest";

import { studentProfileHref } from "../href";

import { STUDENT_PROFILE_TABS, visibleStudentProfileTabs } from "./profile-tabs";

const canOnly =
  (...codes: string[]) =>
  (permission: string) =>
    codes.includes(permission);

describe("visibleStudentProfileTabs", () => {
  it("shows nothing without any data permission", () => {
    expect(visibleStudentProfileTabs(canOnly(), [])).toEqual([]);
  });

  it("shows every tab to a reader holding every permission, in display order", () => {
    expect(visibleStudentProfileTabs(() => true, [])).toEqual([...STUDENT_PROFILE_TABS]);
  });

  it.each([
    ["view_early_warning", ["overview"]],
    ["view_mentoring", ["overview", "grades"]],
    ["view_reports", ["attendance"]],
    ["review_leave_requests", ["permits"]],
    ["view_discipline", ["discipline"]],
    ["manage_counseling", ["counseling"]],
    ["manage_library_members", ["library"]],
    ["view_users", ["guardians"]],
  ])("%s unlocks only %j", (permission, expected) => {
    expect(visibleStudentProfileTabs(canOnly(permission), [])).toEqual(expected);
  });

  it("keeps counseling to the counseling permission", () => {
    const tabs = visibleStudentProfileTabs(
      canOnly("view_discipline", "view_mentoring", "view_reports", "view_users"),
      [],
    );
    expect(tabs).not.toContain("counseling");
  });

  it("drops the tabs of a module the school switched off, and only those", () => {
    const all = visibleStudentProfileTabs(
      () => true,
      ["mentoring", "permits", "discipline", "library"],
    );
    expect(all).toEqual(["overview", "attendance", "guardians"]);
  });

  it("keeps the overview for the risk signals when only mentoring is off", () => {
    expect(
      visibleStudentProfileTabs(canOnly("view_early_warning", "view_mentoring"), ["mentoring"]),
    ).toEqual(["overview"]);
    expect(visibleStudentProfileTabs(canOnly("view_mentoring"), ["mentoring"])).toEqual([]);
  });

  it("drops the grades tab while grading is off, though mentoring is on", () => {
    expect(visibleStudentProfileTabs(canOnly("view_mentoring"), ["grading"])).toEqual(["overview"]);
  });
});

describe("studentProfileHref", () => {
  it("links to the profile, optionally with a tab", () => {
    expect(studentProfileHref("abc")).toBe("/students/abc");
    expect(studentProfileHref("abc", "discipline")).toBe("/students/abc?tab=discipline");
  });
});
