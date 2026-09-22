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
  MonitorSmartphone,
  NotebookPen,
  Repeat,
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
   * Restricts this item to specific profile kinds, for a screen scoped by
   * account type rather than by a permission code (e.g. a student's own
   * discipline record, which every authenticated user can technically
   * call). Omitted means "any profile kind with the permission".
   */
  profileKinds?: NavProfileKind[];
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
    key: "journal",
    labelKey: "app.journal.navLabel",
    href: "/journal",
    icon: NotebookPen,
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
    group: GROUP.students,
    showInTabBar: true,
  },
  {
    key: "exit-permits",
    labelKey: "nav.permits.items.exitPermit",
    href: "/exit-permits",
    icon: domainIcons.exitPermit,
    group: GROUP.students,
  },
  {
    key: "late-arrivals",
    labelKey: "nav.permits.items.late",
    href: "/late-arrivals",
    icon: domainIcons.late,
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
    if (item.profileKinds && (!profileKind || !item.profileKinds.includes(profileKind))) {
      return false;
    }
    return true;
  });
}
