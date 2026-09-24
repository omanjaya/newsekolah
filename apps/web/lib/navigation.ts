import { domainIcons } from "@newsekolah/ui";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  FileBarChart,
  Fingerprint,
  GraduationCap,
  Home,
  LogIn,
  MonitorSmartphone,
  NotebookPen,
  Repeat,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";

import { academicNavItems } from "./navigation-academic";
import { NAV_GROUP as GROUP } from "./navigation-groups";
import { libraryNavItems } from "./navigation-library";
import { moduleNavItems } from "./navigation-modules";
import { settingsNavItems } from "./navigation-settings";

export { navGroupIcons } from "./navigation-groups";

/** Profile kinds a nav item can be restricted to, mirroring `Me["profile_kind"]`. */
export type NavProfileKind = "student" | "teacher" | "staff" | "parent";

export interface NavItem {
  key: string;
  /**
   * Dotted message key resolved with next-intl's `useTranslations()`. Most
   * entries reuse a shared `@newsekolah/i18n` key (typed `MessageKey`); a
   * few shell-only labels (e.g. "Tampilan") live in apps/web's own
   * messages/*.json under `app.*`, which next-intl does not type-check
   * against `MessageKey`, hence the plain `string` here.
   */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** Permission code required to see this item; omitted means "any signed-in user". */
  permission?: string;
  /**
   * Alternative permission codes that also unlock this item, checked with
   * OR semantics (in addition to `permission`, if both are set): visible
   * once the reader holds any one of these. Used for a screen several
   * duties reach through different actions rather than one shared
   * permission code (e.g. leave requests: a student submitter, a
   * homeroom/leadership reviewer, a counselor/leadership issuer, and a
   * parent guardian-approver all use `/leave-requests`, each unlocking a
   * different tab of it -- see features/permits/components/
   * leave-requests-view.tsx).
   */
  anyPermission?: string[];
  /**
   * Permission needed to open the route when it is looser than the one
   * gating the menu entry (a page with a self-scoped tab for users who do
   * not get the entry). Defaults to `permission`.
   */
  routePermission?: string;
  /**
   * Restricts this item to specific profile kinds, for a screen scoped by
   * account type rather than by a permission code (e.g. a student's own
   * discipline record, which every authenticated user can technically
   * call). Omitted means "any profile kind with the permission".
   */
  profileKinds?: NavProfileKind[];
  /**
   * Profile kinds excluded from this item even though they pass its
   * permission check -- the opposite of `profileKinds`, for a permission
   * that is intentionally broad (e.g. `view_academic_data`, granted to a
   * student for their own schedule) on a screen meant for staff, not the
   * student account itself. A reader with no profile row at all (e.g. the
   * bootstrap super admin, created before any `user_profiles` row exists)
   * is never excluded by this list, so it never takes a screen away from
   * an account the permission alone would still let through.
   */
  excludeProfileKinds?: NavProfileKind[];
  /** Shown in the mobile bottom tab bar in addition to the sidebar. */
  showInTabBar?: boolean;
  /**
   * Shorter label for the tab bar, where a full sidebar label wraps to two
   * lines and makes that one tab taller than its neighbours. Falls back to
   * `labelKey`.
   */
  tabLabelKey?: string;
  /**
   * Sidebar group, as a message key (e.g. "nav.academic.label"), translated
   * by the sidebar. Omitted items render flat above the groups.
   */
  group?: string;
  sidebarPlacement?: "main" | "footer" | "hidden";
  accountMenu?: boolean;
}

/**
 * Single source of truth for the sidebar, the mobile tab bar, and the
 * command palette (docs/03-layered-architecture.md section 3, docs/07-ui-ux.md
 * section 2). Every item resolves to a real page; groups follow the
 * documented information architecture.
 */
export const navigation: NavItem[] = [
  { key: "dashboard", labelKey: "nav.home", href: "/dashboard", icon: Home, showInTabBar: true },

  {
    key: "schedule",
    labelKey: "nav.academic.items.schedule",
    href: "/schedule",
    icon: domainIcons.schedule,
    permission: "view_schedules",
    group: GROUP.academic,
  },
  {
    key: "attendance",
    labelKey: "nav.academic.items.attendance",
    href: "/attendance",
    icon: domainIcons.attendance,
    permission: "view_attendance",
    group: GROUP.academic,
    showInTabBar: true,
  },
  {
    key: "substitutions",
    labelKey: "nav.academic.items.substituteTeacher",
    href: "/substitutions",
    icon: Repeat,
    permission: "manage_attendance",
    group: GROUP.academic,
  },
  {
    key: "homeroom",
    labelKey: "nav.academic.items.homeroomClass",
    href: "/homeroom",
    icon: UsersRound,
    permission: "view_attendance",
    group: GROUP.academic,
  },
  {
    key: "attendance-reports",
    labelKey: "app.attendanceReports.navLabel",
    href: "/attendance/reports",
    icon: FileBarChart,
    permission: "view_reports",
    // The "mine" tab lists a teacher's own sessions; any teacher who takes
    // attendance may open it without view_reports.
    routePermission: "manage_attendance",
    group: GROUP.academic,
  },
  {
    key: "staff-attendance",
    labelKey: "app.staffAttendance.navLabel",
    href: "/staff-attendance",
    icon: Fingerprint,
    permission: "view_staff_attendance",
    group: GROUP.staff,
  },
  {
    key: "check-in",
    labelKey: "app.staffAttendance.self.navLabel",
    href: "/check-in",
    icon: LogIn,
    profileKinds: ["teacher", "staff"],
    group: GROUP.staff,
  },
  {
    key: "journal",
    labelKey: "app.journal.navLabel",
    href: "/journal",
    icon: NotebookPen,
    // The page lists classes and subjects (view_academic_data) and records
    // the reader's own teaching; parents and students have no journal.
    permission: "view_academic_data",
    profileKinds: ["teacher", "staff"],
    group: GROUP.academic,
  },
  {
    key: "monitor",
    labelKey: "app.monitor.navLabel",
    href: "/monitor",
    icon: MonitorSmartphone,
    permission: "view_monitor_presence",
    group: GROUP.academic,
  },

  {
    key: "grading",
    labelKey: "nav.academic.items.grading",
    href: "/grading",
    icon: domainIcons.grades,
    permission: "manage_grades",
    group: GROUP.academic,
  },
  {
    key: "my-grades",
    labelKey: "nav.compact.grades",
    href: "/my-grades",
    icon: domainIcons.grades,
    permission: "view_own_grades",
    group: GROUP.academic,
  },
  {
    key: "children",
    labelKey: "app.family.nav.myChildren",
    href: "/children",
    icon: Users,
    permission: "view_child_attendance",
    group: GROUP.academic,
  },
  {
    key: "violations",
    labelKey: "nav.discipline.items.violations",
    href: "/discipline/violations",
    icon: domainIcons.violation,
    permission: "view_discipline",
    group: GROUP.students,
  },
  {
    key: "my-discipline",
    labelKey: "app.family.nav.myDiscipline",
    href: "/my-discipline",
    icon: domainIcons.violation,
    profileKinds: ["student"],
    group: GROUP.students,
  },
  {
    key: "warning-letters",
    labelKey: "nav.discipline.items.warningLetters",
    href: "/discipline/warning-letters",
    icon: domainIcons.violation,
    permission: "view_discipline",
    group: GROUP.students,
  },
  {
    key: "counseling",
    labelKey: "nav.discipline.items.counseling",
    href: "/discipline/counseling",
    icon: domainIcons.violation,
    permission: "manage_counseling",
    group: GROUP.students,
  },
  {
    key: "analytics",
    labelKey: "app.analytics.navLabel",
    href: "/analytics",
    icon: ShieldAlert,
    permission: "view_early_warning",
    group: GROUP.students,
  },
  {
    key: "leave-requests",
    labelKey: "nav.permits.items.plannedLeave",
    tabLabelKey: "nav.compact.permits",
    href: "/leave-requests",
    icon: ClipboardList,
    // features/permits/components/leave-requests-view.tsx renders whichever
    // of these four action permissions the reader holds -- a student
    // submitter, a parent guardian-approver, a homeroom/leadership duty
    // reviewer, or a counselor/leadership duty letter-issuer -- and shows
    // its own "no access" empty state to anyone with none of them, so a
    // role without any of the four never gets a real screen here.
    anyPermission: [
      "submit_leave_requests",
      "review_leave_requests",
      "issue_leave_letters",
      "approve_child_leave_requests",
    ],
    group: GROUP.students,
    showInTabBar: true,
  },
  {
    key: "exit-permits",
    labelKey: "nav.permits.items.exitPermit",
    href: "/exit-permits",
    icon: domainIcons.exitPermit,
    // Mirrors features/permits/components/exit-permits-view.tsx's own
    // three gates: a student submitter, a teacher/staff approver
    // (issue_scan_tokens -- already a role default for both), and a
    // security-duty gate scanner. Nothing in that view branches on
    // profile kind, so parents and librarians (who hold none of the
    // three by default) correctly see neither the item nor a real tab.
    anyPermission: ["submit_leave_requests", "issue_scan_tokens", "scan_exit_permits"],
    group: GROUP.students,
  },
  {
    key: "late-arrivals",
    labelKey: "nav.permits.items.late",
    href: "/late-arrivals",
    icon: domainIcons.late,
    // features/permits/components/late-arrivals-view.tsx deliberately
    // offers the review queue to every teacher/staff account rather than
    // gating it on a picket-only permission (reviewing is scoped
    // server-side to the duty teacher who opened the instance, or a
    // manage_attendance admin/super admin), and gives everyone else --
    // students, who scan the duty teacher's QR to self-report -- the
    // "mine" flow instead. `profileKinds` would be the natural fit, but
    // an allow-list would also hide this from an admin/super admin
    // created with no profile row at all (e.g. cmd/bootstrap's account,
    // which has full manage_attendance and can genuinely use the review
    // queue); exclude the one profile kind with no use for either flow
    // instead.
    excludeProfileKinds: ["parent"],
    group: GROUP.students,
  },
  {
    key: "duty",
    labelKey: "app.duty.navLabel",
    href: "/duty",
    icon: domainIcons.qr,
    permission: "issue_scan_tokens",
    group: GROUP.students,
  },
  {
    key: "classroom-entry",
    labelKey: "app.permits.classroomEntry.navLabel",
    href: "/classroom-entry",
    icon: ScanLine,
    profileKinds: ["student"],
    group: GROUP.students,
  },

  {
    key: "announcements",
    labelKey: "nav.communication.items.announcements",
    href: "/announcements",
    icon: domainIcons.announcement,
  },
  {
    key: "notifications",
    labelKey: "nav.communication.items.notifications",
    href: "/notifications",
    icon: Bell,
    sidebarPlacement: "hidden",
  },

  {
    key: "school-classes",
    labelKey: "nav.schoolData.items.classesAndStudents",
    href: "/school/classes",
    icon: domainIcons.users,
    permission: "view_academic_data",
    // view_academic_data is also a student's own permission (it covers
    // their schedule and grading context), but this class/student roster
    // is a master-data screen for staff, not a student one -- exclude the
    // account kinds it is not for instead of narrowing the permission,
    // which would take the roster away from teachers and staff who need
    // it too.
    excludeProfileKinds: ["student", "parent"],
    group: GROUP.masterData,
  },
  {
    key: "school-users",
    labelKey: "app.navigation.users",
    href: "/school/users",
    icon: UserRound,
    permission: "view_users",
    group: GROUP.masterData,
  },
  {
    key: "school-learning",
    labelKey: "app.academic.learning.title",
    href: "/school/learning",
    icon: domainIcons.grades,
    permission: "manage_master_data",
    group: GROUP.masterData,
  },
  {
    key: "school-assignments",
    labelKey: "app.academic.assignments.title",
    href: "/school/assignments",
    icon: ShieldCheck,
    permission: "manage_master_data",
    group: GROUP.masterData,
  },
  {
    key: "school-calendar",
    labelKey: "nav.schoolData.items.academicCalendar",
    href: "/school/calendar",
    icon: CalendarDays,
    permission: "view_academic_data",
    group: GROUP.academic,
  },
  {
    key: "school-promotion",
    labelKey: "nav.schoolData.items.promotion",
    href: "/school/promotion",
    icon: GraduationCap,
    permission: "manage_enrollments",
    group: GROUP.academic,
  },

  ...academicNavItems,
  ...libraryNavItems,
  ...moduleNavItems,
  ...settingsNavItems,
];

export function filterNavigation(
  items: NavItem[],
  can: (permission: string) => boolean,
  profileKind?: NavProfileKind,
): NavItem[] {
  return items.filter((item) => {
    if (item.permission && !can(item.permission)) return false;
    if (item.anyPermission && !item.anyPermission.some((code) => can(code))) return false;
    if (item.profileKinds && (!profileKind || !item.profileKinds.includes(profileKind))) {
      return false;
    }
    if (item.excludeProfileKinds && profileKind && item.excludeProfileKinds.includes(profileKind)) {
      return false;
    }
    return true;
  });
}
