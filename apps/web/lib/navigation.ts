import { domainIcons } from "@newsekolah/ui";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  ListChecks,
  Home,
  MessageCircle,
  Plug,
  Repeat,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";

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
   * Sidebar group, as a message key (e.g. "nav.academic.label"), translated
   * by the sidebar. Omitted items render flat above the groups.
   */
  group?: string;
}

const GROUP = {
  academic: "nav.academic.label",
  discipline: "nav.discipline.label",
  library: "nav.library.label",
  permits: "nav.permits.label",
  communication: "nav.communication.label",
  schoolData: "nav.schoolData.label",
  settings: "nav.settings.label",
  platform: "nav.platform.label",
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
    group: GROUP.discipline,
  },
  {
    key: "my-discipline",
    labelKey: "app.family.nav.myDiscipline",
    href: "/my-discipline",
    icon: domainIcons.violation,
    profileKinds: ["student"],
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
    key: "library-catalogue",
    labelKey: "nav.library.items.catalog",
    href: "/library/catalogue",
    icon: domainIcons.library,
    permission: "view_library",
    group: GROUP.library,
  },
  {
    key: "library-desk",
    labelKey: "nav.library.items.circulation",
    href: "/library/desk",
    icon: domainIcons.library,
    permission: "manage_library_circulation",
    group: GROUP.library,
  },
  {
    key: "library-stocktake",
    labelKey: "nav.library.items.stockOpname",
    href: "/library/stocktake",
    icon: domainIcons.library,
    permission: "manage_library_catalog",
    group: GROUP.library,
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
    key: "school-calendar",
    labelKey: "nav.schoolData.items.academicCalendar",
    href: "/school/calendar",
    icon: CalendarDays,
    permission: "view_academic_data",
    group: GROUP.schoolData,
  },
  {
    key: "school-promotion",
    labelKey: "nav.schoolData.items.promotion",
    href: "/school/promotion",
    icon: GraduationCap,
    permission: "manage_enrollments",
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
    key: "reports",
    labelKey: "app.reports.navLabel",
    href: "/reports",
    icon: FileSpreadsheet,
    permission: "view_reports",
    group: GROUP.settings,
  },
  {
    key: "setup",
    labelKey: "app.onboarding.navLabel",
    href: "/setup",
    icon: ListChecks,
    permission: "manage_settings",
    group: GROUP.settings,
  },
  {
    key: "settings-security",
    labelKey: "app.security.navLabel",
    href: "/settings/security",
    icon: ShieldCheck,
    group: GROUP.settings,
  },
  {
    key: "settings-sso",
    labelKey: "app.sso.navLabel",
    href: "/settings/sso",
    icon: ShieldCheck,
    permission: "manage_settings",
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
    key: "settings-integrations",
    labelKey: "app.integrations.navLabel",
    href: "/settings/integrations",
    icon: Plug,
    permission: "view_integrations",
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
    key: "settings-whatsapp",
    labelKey: "app.messaging.navLabel",
    href: "/settings/whatsapp",
    icon: MessageCircle,
    permission: "manage_whatsapp",
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

  {
    key: "platform-tenants",
    labelKey: "nav.platform.items.tenants",
    href: "/platform",
    icon: Building2,
    permission: "platform_superadmin",
    group: GROUP.platform,
  },
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
