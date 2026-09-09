import { domainIcons } from "@newsekolah/ui";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  ClipboardList,
  Home,
  Repeat,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

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
  /** Shown in the mobile bottom tab bar in addition to the sidebar. */
  showInTabBar?: boolean;
  /**
   * Sidebar group, as a message key (e.g. "nav.academic.label"), translated
   * by the sidebar. Omitted items render flat above the groups.
   */
  group?: string;
}

const GROUP = {
  academic: "nav.academic.label",
  discipline: "nav.discipline.label",
  permits: "nav.permits.label",
  communication: "nav.communication.label",
  schoolData: "nav.schoolData.label",
  settings: "nav.settings.label",
} as const;

/**
 * Single source of truth for the sidebar, the mobile tab bar, and the
 * command palette (docs/03-layered-architecture.md section 3, docs/07-ui-ux.md
 * section 2). Only lists items that resolve to a real page (antislop R-24:
 * every item needs a real destination); groups follow the docs/07
 * information architecture and appear once their first page ships.
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
    permission: "manage_attendance",
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
    key: "violations",
    labelKey: "nav.discipline.items.violations",
    href: "/discipline/violations",
    icon: domainIcons.violation,
    permission: "view_discipline",
    group: GROUP.discipline,
  },
  {
    key: "warning-letters",
    labelKey: "nav.discipline.items.warningLetters",
    href: "/discipline/warning-letters",
    icon: domainIcons.violation,
    permission: "view_discipline",
    group: GROUP.discipline,
  },
  {
    key: "counseling",
    labelKey: "nav.discipline.items.counseling",
    href: "/discipline/counseling",
    icon: domainIcons.violation,
    permission: "manage_counseling",
    group: GROUP.discipline,
  },
  {
    key: "leave-requests",
    labelKey: "nav.permits.items.plannedLeave",
    href: "/leave-requests",
    icon: ClipboardList,
    group: GROUP.permits,
    showInTabBar: true,
  },
  {
    key: "exit-permits",
    labelKey: "nav.permits.items.exitPermit",
    href: "/exit-permits",
    icon: domainIcons.exitPermit,
    group: GROUP.permits,
  },
  {
    key: "late-arrivals",
    labelKey: "nav.permits.items.late",
    href: "/late-arrivals",
    icon: domainIcons.late,
    group: GROUP.permits,
  },
  {
    key: "duty",
    labelKey: "app.duty.navLabel",
    href: "/duty",
    icon: domainIcons.qr,
    permission: "issue_scan_tokens",
    group: GROUP.permits,
  },

  {
    key: "announcements",
    labelKey: "nav.communication.items.announcements",
    href: "/announcements",
    icon: domainIcons.announcement,
    group: GROUP.communication,
  },
  {
    key: "notifications",
    labelKey: "nav.communication.items.notifications",
    href: "/notifications",
    icon: Bell,
    group: GROUP.communication,
  },

  {
    key: "school-classes",
    labelKey: "nav.schoolData.items.classesAndStudents",
    href: "/school/classes",
    icon: domainIcons.users,
    permission: "view_academic_data",
    group: GROUP.schoolData,
  },
  {
    key: "school-users",
    labelKey: "nav.schoolData.items.teachersAndStaff",
    href: "/school/users",
    icon: UserRound,
    permission: "view_users",
    group: GROUP.schoolData,
  },
  {
    key: "school-subjects",
    labelKey: "nav.schoolData.items.subjects",
    href: "/school/subjects",
    icon: domainIcons.grades,
    permission: "manage_master_data",
    group: GROUP.schoolData,
  },
  {
    key: "school-periods",
    labelKey: "nav.schoolData.items.periods",
    href: "/school/periods",
    icon: domainIcons.schedule,
    permission: "manage_master_data",
    group: GROUP.schoolData,
  },
  {
    key: "school-duties",
    labelKey: "nav.schoolData.items.assignments",
    href: "/school/duties",
    icon: ShieldCheck,
    permission: "manage_master_data",
    group: GROUP.schoolData,
  },

  {
    key: "settings-roles",
    labelKey: "nav.settings.items.rolesAndAccess",
    href: "/settings/roles",
    icon: ShieldCheck,
    permission: "view_roles",
    group: GROUP.settings,
  },
  {
    key: "settings-audit",
    labelKey: "app.audit.navLabel",
    href: "/settings/audit-logs",
    icon: ShieldCheck,
    permission: "view_audit_logs",
    group: GROUP.settings,
  },
  {
    key: "settings-notifications",
    labelKey: "app.settings.notifications.navLabel",
    href: "/settings/notifications",
    icon: Bell,
    group: GROUP.settings,
  },
  {
    key: "settings-appearance",
    labelKey: "app.shell.appearance",
    href: "/settings/appearance",
    icon: Settings,
    group: GROUP.settings,
  },
  {
    key: "profile",
    labelKey: "nav.compact.profile",
    href: "/profile",
    icon: UserRound,
    showInTabBar: true,
    group: GROUP.settings,
  },
];

export function filterNavigation(
  items: NavItem[],
  can: (permission: string) => boolean,
): NavItem[] {
  return items.filter((item) => !item.permission || can(item.permission));
}
