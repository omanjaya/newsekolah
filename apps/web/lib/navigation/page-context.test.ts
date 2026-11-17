import { describe, expect, it } from "vitest";

import type { Me } from "../session/session-provider";

import { resolvePageContext, withCarriedParams } from "./page-context";
import { appNavigationFor } from "./use-app-navigation";

function reader(
  permissions: string[],
  profileKind: "staff" | "teacher" | "student" = "staff",
  roles: string[] = ["admin"],
): Me {
  return {
    id: "u1",
    name: "Admin",
    permissions,
    profile_kind: profileKind,
    roles: roles.map((slug) => ({ id: slug, slug, name: slug })),
    duties: [],
    disabled_modules: [],
  } as unknown as Me;
}

const ADMIN = reader([
  "view_users",
  "manage_permissions",
  "view_academic_data",
  "manage_master_data",
  "manage_enrollments",
  "view_attendance",
  "manage_attendance",
  "view_reports",
  "view_library",
  "manage_library_catalog",
  "manage_library_circulation",
  "manage_settings",
]);

describe("resolvePageContext", () => {
  it("takes the area the sidebar highlights, its group and its pages as tabs", () => {
    const context = resolvePageContext("/journal", appNavigationFor(ADMIN));
    expect(context.entry?.key).toBe("attendance");
    // The key the sidebar labels the group with, so the two read alike.
    expect(context.groupKey).toBe("app.shell.nav.groups.academic");
    expect(context.isDetail).toBe(false);
    expect(context.tabs.map((tab) => [tab.href, tab.current])).toEqual([
      ["/attendance", false],
      ["/journal", true],
      ["/attendance/reports", false],
    ]);
  });

  it("marks the longest matching page current, not every ancestor", () => {
    const context = resolvePageContext("/attendance/reports", appNavigationFor(ADMIN));
    expect(context.page?.key).toBe("attendance-reports");
    expect(context.tabs.filter((tab) => tab.current).map((tab) => tab.key)).toEqual([
      "attendance-reports",
    ]);
  });

  it("offers only the pages the reader may open", () => {
    // The attendance report opens with manage_attendance; a principal reads
    // attendance through view_reports on /reports instead.
    const principal = reader(["view_attendance", "view_academic_data", "view_reports"], "teacher", [
      "principal",
    ]);
    const context = resolvePageContext("/journal", appNavigationFor(principal));
    expect(context.tabs.map((tab) => tab.key)).not.toContain("attendance-reports");
  });

  it("gives a teacher who takes attendance the report tab its route opens for", () => {
    const teacher = reader(
      ["view_attendance", "manage_attendance", "view_academic_data"],
      "teacher",
      ["teacher"],
    );
    const context = resolvePageContext("/attendance", appNavigationFor(teacher));
    expect(context.tabs.map((tab) => tab.key)).toEqual([
      "attendance",
      "journal",
      "attendance-reports",
    ]);
  });

  it("draws no tab for a route that only redirects", () => {
    const librarian = reader(["view_library", "manage_library_settings"], "staff", ["librarian"]);
    const context = resolvePageContext("/library/settings", appNavigationFor(librarian));
    expect(context.entry?.key).toBe("library-settings");
    expect(context.tabs).toEqual([]);
  });

  it("drops a strip of one page", () => {
    const student = reader(["view_attendance"], "student", ["student"]);
    const context = resolvePageContext("/attendance", appNavigationFor(student));
    expect(context.entry?.key).toBe("attendance");
    expect(context.tabs).toEqual([]);
  });

  it("treats a route below its page as a detail page, without tabs", () => {
    const context = resolvePageContext("/library/catalogue/t-1", appNavigationFor(ADMIN));
    expect(context.page?.key).toBe("library-catalogue");
    expect(context.isDetail).toBe(true);
    expect(context.tabs).toEqual([]);
  });

  it("keeps the home and the settings hub free of tabs", () => {
    expect(resolvePageContext("/dashboard", appNavigationFor(ADMIN)).tabs).toEqual([]);
    expect(resolvePageContext("/settings", appNavigationFor(ADMIN)).tabs).toEqual([]);
  });

  it("knows nothing about a route outside the registry", () => {
    const context = resolvePageContext("/no-such-page", appNavigationFor(ADMIN));
    expect(context.entry).toBeUndefined();
    expect(context.page).toBeUndefined();
    expect(context.tabs).toEqual([]);
    expect(context.isDetail).toBe(false);
  });
});

describe("withCarriedParams", () => {
  it("carries the named parameters that are set, and only those", () => {
    const search = new URLSearchParams("date=2026-11-14&tab=mine");
    expect(withCarriedParams("/journal", search, ["date"])).toBe("/journal?date=2026-11-14");
    expect(withCarriedParams("/journal", search, [])).toBe("/journal");
    expect(withCarriedParams("/journal", new URLSearchParams(""), ["date"])).toBe("/journal");
  });

  it("never overrides a parameter the link already has", () => {
    const search = new URLSearchParams("date=2026-11-14");
    expect(withCarriedParams("/journal?date=2026-01-01", search, ["date"])).toBe(
      "/journal?date=2026-01-01",
    );
  });
});
