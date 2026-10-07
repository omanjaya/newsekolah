import { describe, expect, it } from "vitest";

import { mobileNavigation } from "./mobile-navigation";
import { filterNavigation, navigation, type NavProfileKind } from "./navigation";
import { activeNavHref } from "./navigation/active-href";
import { canOpenPath } from "./navigation-permissions";
import { consolidateNavigation } from "./navigation-workspaces";

function menu(
  permissions: string[],
  profileKind: NavProfileKind = "staff",
  duties: { slug: string }[] = [],
) {
  const can = (code: string) => permissions.includes(code);
  return consolidateNavigation(filterNavigation(navigation, can, profileKind), {
    profileKind,
    duties,
    canManageSchool: permissions.includes("manage_master_data"),
    can,
  });
}

describe("consolidated workspaces", () => {
  it("does not mistake student reference-data access for school administration", () => {
    const items = menu(
      ["view_academic_data", "view_attendance", "view_schedules", "view_own_grades"],
      "student",
    );
    expect(items.map((item) => item.key)).not.toEqual(
      expect.arrayContaining(["school-classes", "academic-years", "homeroom"]),
    );
    expect(items.find((item) => item.key === "attendance")?.labelKey).toBe(
      "app.workspace.myAttendance",
    );
    expect(items.find((item) => item.key === "grading")?.href).toBe("/my-grades");
    expect(mobileNavigation(items, "student").map((item) => item.key)).toContain("scan");
  });

  it("adds the homeroom workspace only for an actual homeroom assignment", () => {
    expect(menu(["view_attendance"], "teacher").some((item) => item.key === "homeroom")).toBe(
      false,
    );
    expect(
      menu(["view_attendance"], "teacher", [{ slug: "homeroom" }]).some(
        (item) => item.key === "homeroom",
      ),
    ).toBe(true);
  });

  it("retains school management for teachers with administrative authority", () => {
    const keys = menu(["view_academic_data", "manage_master_data"], "teacher").map(
      (item) => item.key,
    );
    expect(keys).toContain("school-classes");
    expect(keys).toContain("academic-years");
  });

  it("keeps library settings reachable for a custom role with no circulation or membership grant", () => {
    const items = menu(["manage_library_settings"]);
    const entry = items.find((item) => item.key === "library-settings");
    expect(entry?.href).toBe("/library/settings");
    expect(entry?.aliases).toEqual([
      "library-settings",
      "library-loan-rules",
      "library-member-types",
    ]);
    expect(items.some((item) => item.key === "library-desk")).toBe(false);
  });

  it("provides a monitoring fallback without making an ordinary teacher a counselor", () => {
    const items = menu(["view_early_warning", "view_attendance", "view_schedules"], "teacher");
    expect(items.find((item) => item.key === "counseling")?.href).toBe("/analytics");
    expect(mobileNavigation(items, "teacher").map((item) => item.key)).toContain("attendance");
    expect(
      canOpenPath("/discipline/counseling", (code) => code === "view_early_warning", "teacher"),
    ).toBe(false);
  });

  it("does not add a general report permission to a library-only report user", () => {
    const items = menu(["view_library_reports"]);
    expect(items.find((item) => item.key === "reports")?.href).toBe("/reports");
    expect(canOpenPath("/reports", (code) => code === "view_library_reports", "staff")).toBe(true);
    expect(canOpenPath("/reports", () => false, "staff")).toBe(false);
  });

  it("keeps original restricted routes gated after removing their separate menu entries", () => {
    expect(
      canOpenPath("/library/loan-rules", (code) => code === "manage_library_members", "staff"),
    ).toBe(false);
    expect(canOpenPath("/staff-attendance", () => false, "teacher")).toBe(false);
    expect(canOpenPath("/check-in", () => true, "student")).toBe(false);
    expect(canOpenPath("/settings/sso", (code) => code === "view_audit_logs", "staff")).toBe(false);
  });

  it("highlights a single parent across legacy destinations and nested detail routes", () => {
    const items = consolidateNavigation(
      filterNavigation(navigation, () => true, "staff"),
      { profileKind: "staff" },
    );
    expect(activeNavHref("/library/copies", items)).toBe("/library/catalogue");
    expect(activeNavHref("/library/reports", items)).toBe("/reports");
    expect(activeNavHref("/settings/sso", items)).toBe("/settings");
    expect(activeNavHref("/discipline/warning-letters", items)).toBe("/discipline/violations");
    expect(activeNavHref("/library/catalogue/title-id", items)).toBe("/library/catalogue");
    expect(activeNavHref("/discipline/students/student-id", items)).toBe("/discipline/violations");
    expect(activeNavHref("/supervision/observations/observation-id", items)).toBe(
      "/supervision/cycles",
    );
  });

  it("keeps stable unique menu entries and can reach footer settings with only audit access", () => {
    const items = menu(["view_audit_logs"]);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(items.find((item) => item.key === "settings")?.href).toBe("/settings");
    expect(items.find((item) => item.key === "settings")?.sidebarPlacement).toBe("footer");
  });

  it("does not offer an attendance-report fallback that its legacy route guard refuses", () => {
    const items = menu(["view_reports"], "staff");
    expect(items.some((item) => item.key === "attendance")).toBe(false);
    expect(items.find((item) => item.key === "reports")?.href).toBe("/reports");
  });
});
