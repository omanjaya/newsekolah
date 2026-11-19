import { Zap } from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  menuQuickActions,
  mobileNavigation,
  mobileTabLayout,
  mobileTabRoots,
} from "./mobile-navigation";
import { filterNavigation, navigation, type NavProfileKind } from "./navigation";
import { filterNavigationFixture, navAccessFixture } from "./navigation-access.fixture";
import { canOpenPath } from "./navigation-permissions";
import { sortQuickActions } from "./navigation-quick-actions";
import { consolidateNavigation } from "./navigation-workspaces";
import { availableQuickActions } from "./quick-actions";

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
  it("leaves out a destination the bar already offers and takes fewer slots beside a centre action", () => {
    const can = (permission: string) =>
      ["manage_attendance", "view_schedules", "view_attendance"].includes(permission);
    const items = consolidateNavigation(filterNavigationFixture(navigation, can, "teacher"), {
      profileKind: "teacher",
      can,
    });
    const keys = mobileNavigation(items, "teacher", undefined, {
      exclude: "/attendance",
      slots: 2,
    }).map((item) => item.key);
    expect(keys).toEqual(["dashboard", "schedule", "profile"]);
  });
});

/**
 * The phone bar's raised centre action, per seed role (infra/docker/README.dev.md),
 * with the permissions apps/api grants each role and duty
 * (internal/platform/authz/role_defaults.go, duty_defaults.go).
 */
describe("mobile centre action", () => {
  const TEACHER = [
    "view_dashboard",
    "view_schedules",
    "view_academic_data",
    "view_attendance",
    "manage_attendance",
    "manage_grades",
    "view_grades",
    "view_library",
    "issue_scan_tokens",
    "view_discipline",
    "record_violations",
    "view_early_warning",
    "view_own_supervision",
    "respond_to_supervision",
  ];
  const STUDENT = [
    "view_dashboard",
    "view_schedules",
    "view_academic_data",
    "view_own_grades",
    "submit_leave_requests",
    "view_attendance",
  ];

  function layoutFor({
    permissions,
    profile,
    duties = [],
    roles = [],
    disabledModules = [],
    all = false,
  }: {
    permissions: string[];
    profile: NavProfileKind;
    duties?: { slug: string }[];
    roles?: string[];
    disabledModules?: string[];
    all?: boolean;
  }) {
    const can = (permission: string) => all || permissions.includes(permission);
    const access = navAccessFixture(can, profile, roles, disabledModules);
    const items = consolidateNavigation(filterNavigation(navigation, access), {
      profileKind: profile,
      duties,
      canManageSchool: all,
      can,
    });
    const quickActions = sortQuickActions(availableQuickActions(access));
    const canOpen = (path: string) => canOpenPath(path, access);
    const layout = mobileTabLayout({ items, profile, duties, quickActions, canOpen });
    return { layout, canOpen, keys: layout.tabs.map((item) => item.key) };
  }

  it("gives a student Pindai in the middle, with schedule and leave as tabs", () => {
    const { layout, keys } = layoutFor({ permissions: STUDENT, profile: "student" });
    expect(layout.centre?.id).toBe("scan");
    expect(layout.centre?.href).toBe("/scan");
    expect(keys).toEqual(["dashboard", "schedule", "leave-requests"]);
  });

  it("gives a teacher Isi presensi in the middle and drops attendance from the tabs", () => {
    const { layout, keys } = layoutFor({ permissions: TEACHER, profile: "teacher" });
    expect(layout.centre?.id).toBe("attendance");
    expect(layout.centre?.href).toBe("/attendance");
    expect(layout.centre?.ownerHref).toBe("/attendance");
    expect(keys).toEqual(["dashboard", "schedule", "grading"]);
  });

  it("gives a duty teacher the duty QR, with the scanner and attendance as tabs", () => {
    const { layout, keys } = layoutFor({
      permissions: TEACHER,
      profile: "teacher",
      duties: [{ slug: "picket" }],
    });
    expect(layout.centre?.id).toBe("duty-qr");
    expect(layout.centre?.href).toBe("/duty");
    expect(keys).toEqual(["dashboard", "scan", "attendance"]);
  });

  it("gives gate duty (satpam) Pindai, with the visitor book as the first daily tab", () => {
    const { layout, keys } = layoutFor({
      permissions: [
        "view_dashboard",
        "view_academic_data",
        "issue_scan_tokens",
        "view_visitors",
        "manage_visitors",
        "scan_exit_permits",
      ],
      profile: "staff",
      duties: [{ slug: "security" }],
    });
    expect(layout.centre?.id).toBe("scan");
    expect(keys.slice(0, 2)).toEqual(["dashboard", "visitors-board"]);
    expect(keys).not.toContain("scan");
  });

  it("gives a librarian the circulation desk, with the catalogue and members as tabs", () => {
    const { layout, keys } = layoutFor({
      permissions: [
        "view_dashboard",
        "view_library",
        "manage_library_catalog",
        "manage_library_circulation",
        "manage_library_members",
        "manage_library_settings",
        "view_library_reports",
        "view_academic_data",
      ],
      profile: "staff",
      roles: ["librarian"],
    });
    expect(layout.centre?.id).toBe("circulation");
    expect(layout.centre?.href).toBe("/library/desk");
    expect(keys).not.toContain("library-desk");
    expect(keys[0]).toBe("dashboard");
  });

  it("gives a counselor (guru BK) Catat pelanggaran, with the queue and counselling as tabs", () => {
    const { layout, keys } = layoutFor({
      permissions: [
        ...TEACHER,
        "issue_leave_letters",
        "view_reports",
        "manage_counseling",
        "issue_warning_letters",
      ],
      profile: "teacher",
      duties: [{ slug: "counselor" }],
    });
    expect(layout.centre?.id).toBe("record-violation");
    expect(layout.centre?.href).toBe("/discipline/violations?quick=record-violation");
    expect(layout.centre?.ownerHref).toBe("/discipline/violations");
    expect(keys).toEqual(["dashboard", "inbox", "counseling"]);
  });

  it("gives school leadership the decisions waiting on them, with reports and attendance as tabs", () => {
    const { layout, keys } = layoutFor({
      permissions: [
        "view_dashboard",
        "view_staff_attendance",
        "view_reports",
        "view_attendance",
        "review_leave_requests",
        "view_schedules",
      ],
      profile: "teacher",
    });
    expect(layout.centre?.id).toBe("inbox");
    expect(layout.centre?.href).toBe("/inbox");
    expect(keys).toEqual(["dashboard", "reports", "attendance"]);
  });

  it("gives the school office the quick-action sheet, with the queue and accounts as tabs", () => {
    const { layout, keys } = layoutFor({
      permissions: [],
      all: true,
      profile: "staff",
      roles: ["admin"],
    });
    expect(layout.centre?.id).toBe("quick-actions");
    expect(layout.centre?.href).toBeUndefined();
    expect(keys).toEqual(["dashboard", "inbox", "school-users"]);
  });

  it("never offers a centre destination the reader cannot open", () => {
    // With both scanner modules off the scanner refuses everyone, so the
    // student is not sent there.
    const student = layoutFor({
      permissions: STUDENT,
      profile: "student",
      disabledModules: ["permits", "library"],
    });
    expect(student.layout.centre?.id).not.toBe("scan");
    const href = student.layout.centre?.href;
    if (href) expect(student.canOpen(href.split("?")[0] ?? href)).toBe(true);

    // The duty desk is a permits page: with permits off a duty teacher
    // falls back to the scanner (the library still runs it).
    const picket = layoutFor({
      permissions: TEACHER,
      profile: "teacher",
      duties: [{ slug: "picket" }],
      disabledModules: ["permits"],
    });
    expect(picket.canOpen("/duty")).toBe(false);
    expect(picket.layout.centre?.id).toBe("scan");
  });

  it("falls back to the quick-action sheet for a teacher who cannot take attendance", () => {
    const { layout } = layoutFor({
      permissions: TEACHER.filter(
        (permission) => permission !== "manage_attendance" && permission !== "view_attendance",
      ),
      profile: "teacher",
    });
    expect(layout.centre?.id).toBe("quick-actions");
  });

  it("keeps Beranda and three tabs when there is no centre action", () => {
    const items = filterNavigationFixture(navigation, () => false, "staff");
    const layout = mobileTabLayout({
      items,
      profile: "staff",
      quickActions: [],
      canOpen: () => false,
    });
    expect(layout.centre).toBeUndefined();
    expect(layout.tabs.length).toBeLessThanOrEqual(4);
  });

  it("lists every tab and the centre's page as the bar's roots", () => {
    const { layout } = layoutFor({ permissions: TEACHER, profile: "teacher" });
    expect(mobileTabRoots(layout)).toEqual(["/dashboard", "/schedule", "/grading", "/attendance"]);
  });

  it("keeps every quick action reachable from Menu except the one the centre already is", () => {
    const access = navAccessFixture((permission) => TEACHER.includes(permission), "teacher");
    const actions = sortQuickActions(availableQuickActions(access));
    const ids = actions.map((action) => action.id);
    expect(ids).toContain("scan-qr");

    const picket = layoutFor({
      permissions: TEACHER,
      profile: "teacher",
      duties: [{ slug: "picket" }],
    }).layout.centre;
    expect(menuQuickActions(actions, picket).map((action) => action.id)).toEqual(
      ids.filter((id) => id !== "show-duty-qr"),
    );

    // A centre that is a menu page (Isi presensi) stands for no quick action.
    const teacher = layoutFor({ permissions: TEACHER, profile: "teacher" }).layout.centre;
    expect(menuQuickActions(actions, teacher)).toEqual(actions);

    // The quick-action sheet in the middle already lists them all.
    expect(menuQuickActions(actions, { id: "quick-actions", icon: Zap })).toEqual([]);
  });
});
