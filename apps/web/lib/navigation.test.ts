import { Home } from "lucide-react";
import { describe, expect, it } from "vitest";

import { filterNavigation, navigation, type NavItem } from "./navigation";

const items: NavItem[] = [
  { key: "public", labelKey: "nav.home", href: "/dashboard", icon: Home },
  {
    key: "guarded",
    labelKey: "nav.home",
    href: "/guarded",
    icon: Home,
    permission: "library.manage",
  },
];

describe("filterNavigation", () => {
  it("keeps items without a permission requirement", () => {
    const result = filterNavigation(items, () => false);
    expect(result.map((item) => item.key)).toEqual(["public"]);
  });

  it("keeps a guarded item once the permission check passes", () => {
    const result = filterNavigation(items, (permission) => permission === "library.manage");
    expect(result.map((item) => item.key)).toEqual(["public", "guarded"]);
  });

  it("never mutates the input array", () => {
    const before = [...items];
    filterNavigation(items, () => true);
    expect(items).toEqual(before);
  });

  it("keeps a profile-restricted item only for a matching profile kind", () => {
    const scoped: NavItem[] = [
      {
        key: "student-only",
        labelKey: "nav.home",
        href: "/x",
        icon: Home,
        profileKinds: ["student"],
      },
    ];
    expect(filterNavigation(scoped, () => true).map((i) => i.key)).toEqual([]);
    expect(filterNavigation(scoped, () => true, "teacher").map((i) => i.key)).toEqual([]);
    expect(filterNavigation(scoped, () => true, "student").map((i) => i.key)).toEqual([
      "student-only",
    ]);
  });

  it("requires both permission and profile kind when both are set", () => {
    const scoped: NavItem[] = [
      {
        key: "student-with-permission",
        labelKey: "nav.home",
        href: "/x",
        icon: Home,
        permission: "view_x",
        profileKinds: ["student"],
      },
    ];
    expect(filterNavigation(scoped, () => false, "student")).toEqual([]);
    expect(filterNavigation(scoped, () => true, "teacher")).toEqual([]);
    expect(filterNavigation(scoped, () => true, "student").map((i) => i.key)).toEqual([
      "student-with-permission",
    ]);
  });

  it("keeps an anyPermission item once any one of its codes passes", () => {
    const scoped: NavItem[] = [
      {
        key: "either-permission",
        labelKey: "nav.home",
        href: "/x",
        icon: Home,
        anyPermission: ["submit_leave_requests", "review_leave_requests"],
      },
    ];
    expect(filterNavigation(scoped, () => false)).toEqual([]);
    expect(
      filterNavigation(scoped, (permission) => permission === "review_leave_requests").map(
        (i) => i.key,
      ),
    ).toEqual(["either-permission"]);
  });

  it("excludes a profile kind listed in excludeProfileKinds even though the permission passes", () => {
    const scoped: NavItem[] = [
      {
        key: "staff-master-data",
        labelKey: "nav.home",
        href: "/x",
        icon: Home,
        permission: "view_academic_data",
        excludeProfileKinds: ["student", "parent"],
      },
    ];
    expect(filterNavigation(scoped, () => true, "student")).toEqual([]);
    expect(filterNavigation(scoped, () => true, "parent")).toEqual([]);
    expect(filterNavigation(scoped, () => true, "teacher").map((i) => i.key)).toEqual([
      "staff-master-data",
    ]);
    // A reader with no profile row at all (the bootstrap super admin) is
    // never excluded: the permission check alone decides for them.
    expect(filterNavigation(scoped, () => true, undefined).map((i) => i.key)).toEqual([
      "staff-master-data",
    ]);
  });
});

/**
 * Per-role audiences of the real registry, mirroring apps/api's authz
 * role/duty defaults (role_defaults.go, duty_defaults.go) so a permission
 * set here always matches what a seeded account of that kind actually
 * holds. Covers docs/analysis/audit-pra-deploy-2026-09-23.md's "Sidebar per
 * peran" finding: journal, leave-requests, exit-permits and late-arrivals
 * used to show for every role because they carried no permission at all.
 */
describe("navigation registry: per-role audiences", () => {
  const has =
    (...codes: string[]) =>
    (permission: string) =>
      codes.includes(permission);

  it("hides leave-requests, exit-permits and school master data from a librarian", () => {
    // authz.RoleDefaults()'s librarian: library permissions only, no
    // permit or academic-data codes.
    const can = has(
      "view_dashboard",
      "view_notifications",
      "view_library",
      "view_own_library_loans",
      "manage_library_catalog",
      "manage_library_circulation",
      "manage_library_members",
      "manage_library_settings",
      "view_library_reports",
    );
    const keys = filterNavigation(navigation, can, "staff").map((item) => item.key);
    expect(keys).not.toContain("leave-requests");
    expect(keys).not.toContain("exit-permits");
    expect(keys).not.toContain("school-classes");
    expect(keys).not.toContain("academic-years");
    // A librarian's profile kind is "staff" like any other staff account,
    // so the deliberately duty-agnostic late-arrivals review queue
    // (features/permits/components/late-arrivals-view.tsx) still reaches
    // them -- not a bug this ticket changes.
    expect(keys).toContain("late-arrivals");
  });

  it("gives a student their own leave/exit self-service but not the staff master-data roster", () => {
    // authz.RoleDefaults()'s student.
    const can = has(
      "view_dashboard",
      "view_announcements",
      "view_notifications",
      "view_schedules",
      "view_academic_data",
      "view_own_grades",
      "submit_leave_requests",
      "view_attendance",
      "view_own_library_loans",
    );
    const keys = filterNavigation(navigation, can, "student").map((item) => item.key);
    expect(keys).toContain("leave-requests");
    expect(keys).toContain("exit-permits");
    expect(keys).toContain("late-arrivals");
    expect(keys).not.toContain("school-classes");
    expect(keys).not.toContain("academic-years");
  });

  it("gives a parent the guardian approval queue but no exit-permit or late-arrival screen", () => {
    // authz.RoleDefaults()'s parent: approve_child_leave_requests only,
    // never submit_leave_requests or issue_scan_tokens (verified against
    // the seeded "ortu" account, e2e/smoke/roles/ortu.spec.ts).
    const can = has(
      "view_dashboard",
      "view_announcements",
      "view_notifications",
      "view_child_attendance",
      "view_child_grades",
      "approve_child_leave_requests",
      "view_child_billing",
      "view_own_library_loans",
    );
    const keys = filterNavigation(navigation, can, "parent").map((item) => item.key);
    expect(keys).toContain("leave-requests");
    expect(keys).not.toContain("exit-permits");
    expect(keys).not.toContain("late-arrivals");
    expect(keys).not.toContain("school-classes");
    expect(keys).not.toContain("academic-years");
  });

  it("gives a duty-less teacher the master-data roster and exit-permit approval, not the leave review queue", () => {
    // authz.RoleDefaults()'s teacher, no duty grant on top.
    const can = has(
      "view_dashboard",
      "view_announcements",
      "view_schedules",
      "view_academic_data",
      "view_attendance",
      "manage_attendance",
      "view_notifications",
      "manage_grades",
      "view_grades",
      "view_library",
      "view_own_library_loans",
      "issue_scan_tokens",
      "create_announcements",
      "edit_announcements",
      "publish_announcements",
      "view_discipline",
      "record_violations",
      "view_early_warning",
    );
    const keys = filterNavigation(navigation, can, "teacher").map((item) => item.key);
    expect(keys).not.toContain("leave-requests");
    expect(keys).toContain("exit-permits");
    expect(keys).toContain("late-arrivals");
    expect(keys).toContain("school-classes");
    expect(keys).toContain("academic-years");
  });

  it("gives a homeroom-duty teacher (wali kelas) the leave review queue", () => {
    // Base teacher role plus authz.DutyTypeDefaults()'s "homeroom" duty.
    const can = has("view_academic_data", "view_attendance", "review_leave_requests");
    const keys = filterNavigation(navigation, can, "teacher").map((item) => item.key);
    expect(keys).toContain("leave-requests");
  });

  it("gives the principal (Kepala Sekolah) oversight of every module (grading read-only) but no settings, counseling or user-management screen", () => {
    // authz.RoleDefaults()'s principal (role_defaults.go); profile kind
    // "teacher" per cmd/seed's profileKindByRole["principal"].
    const can = has(
      "view_dashboard",
      "view_announcements",
      "publish_announcements",
      "view_audit_logs",
      "view_schedules",
      "view_journals_all",
      "view_attendance",
      "view_staff_attendance",
      "view_notifications",
      "view_reports",
      "manage_report_schedules",
      "view_library",
      "view_library_reports",
      "view_own_library_loans",
      "view_academic_data",
      "view_activities",
      "view_early_warning",
      "view_billing",
      "view_discipline",
      "view_mentoring",
      "view_supervision",
      "manage_supervision",
      "view_visitors",
      "view_visitor_incidents",
      "view_visitor_reports",
      "view_grades",
    );
    const keys = filterNavigation(navigation, can, "teacher").map((item) => item.key);

    // Sees the gradebook screen read-only (view_grades, no manage_grades):
    // features/grading/components/grading-view.tsx hides every
    // edit/save/publish control for this permission combination.
    expect(keys).toContain("grading");

    // Sees everything the school runs: attendance, staff attendance,
    // discipline, reports, library, billing, visitors, supervision,
    // academic structure, journals -- and the late-arrivals queue every
    // non-parent account reaches regardless of permission.
    for (const key of [
      "schedule",
      "attendance",
      "attendance-reports",
      "staff-attendance",
      "journal",
      "violations",
      "warning-letters",
      "analytics",
      "late-arrivals",
      "school-classes",
      "school-calendar",
      "library-dashboard",
      "library-reports",
      "visitors-board",
      "visitors-recap",
      "activities-clubs",
      "billing",
      "mentoring-groups",
      "supervision-cycles",
      "supervision-my-report",
      "settings-audit",
      "reports",
    ]) {
      expect(keys).toContain(key);
    }

    // Never an operator/administrator: no settings, master data,
    // grade-editing (only the read-only "grading" entry itself, asserted
    // above), counseling, user management, workflow or permits-actor
    // screen.
    for (const key of [
      "settings-roles",
      "school-users",
      "school-learning",
      "school-assignments",
      "school-structure",
      "academic-enrollment-import",
      "academic-new-year-setup",
      "school-promotion",
      "setup",
      "settings-session",
      "settings-branding",
      "settings-report-header",
      "settings-sso",
      "settings-integrations",
      "settings-notification-defaults",
      "settings-document-templates",
      "settings-workflows",
      "settings-whatsapp",
      "platform-tenants",
      "my-grades",
      "counseling",
      "substitutions",
      "leave-requests",
      "exit-permits",
      "duty",
      "library-desk",
      "library-members",
      "library-loan-rules",
    ]) {
      expect(keys).not.toContain(key);
    }
  });
});
