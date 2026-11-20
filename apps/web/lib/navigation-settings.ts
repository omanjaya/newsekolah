import { domainIcons } from "@newsekolah/ui";
import {
  BellDot,
  BellRing,
  FileSpreadsheet,
  History,
  KeyRound,
  KeySquare,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  Palette,
  Plug,
  School,
  Settings,
  ShieldCheck,
  Signature,
  Siren,
  SunMoon,
  UserRound,
} from "lucide-react";

import type { NavItem } from "./navigation";
import { NAV_GROUP } from "./navigation-groups";
import { DOCUMENT_TEMPLATE_SECTIONS, REPORT_SECTIONS } from "./navigation-sections";

/**
 * Settings, reporting and platform entries, split out of `navigation.ts`
 * so that file stays under the 400-line cap (docs/04-clean-code.md).
 * Spread into `navigation.ts` after the school-data group. Each entry has
 * a glyph of its own: the hub, the palette and the section tabs list
 * them side by side, so the shield is kept for roles and access only.
 */
export const settingsNavItems: NavItem[] = [
  {
    key: "settings-hub",
    labelKey: "app.settingsHub.title",
    href: "/settings",
    icon: Settings,
    // The hub lists only the cards the reader can open, so any one settings
    // permission is enough to land on it.
    anyPermission: [
      "manage_settings",
      "view_roles",
      "view_audit_logs",
      "manage_notification_settings",
      "manage_whatsapp",
      "view_integrations",
      "manage_workflows",
    ],
    group: NAV_GROUP.settings,
  },
  {
    key: "settings-roles",
    labelKey: "nav.settings.items.rolesAndAccess",
    href: "/settings/roles",
    icon: ShieldCheck,
    permission: "view_roles",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "reports",
    labelKey: "app.reports.navLabel",
    href: "/reports",
    // One tab per report domain; open while any granted tab's module is on.
    moduleSections: REPORT_SECTIONS,
    icon: FileSpreadsheet,
  },
  {
    key: "setup",
    labelKey: "app.onboarding.navLabel",
    href: "/setup",
    icon: ListChecks,
    permission: "manage_settings",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-security",
    labelKey: "app.security.navLabel",
    href: "/settings/security",
    icon: LockKeyhole,
    group: NAV_GROUP.settings,
    sidebarPlacement: "hidden",
    accountMenu: true,
  },
  {
    key: "settings-session",
    labelKey: "app.settings.session.navLabel",
    href: "/settings/session",
    icon: KeyRound,
    permission: "manage_settings",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-attendance",
    labelKey: "app.settings.attendance.navLabel",
    href: "/settings/attendance",
    icon: domainIcons.attendance,
    permission: "manage_settings",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-branding",
    labelKey: "app.settings.branding.navLabel",
    href: "/settings/branding",
    icon: Palette,
    permission: "manage_settings",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-report-header",
    labelKey: "app.settings.reportHeader.navLabel",
    href: "/settings/report-header",
    // Not the document templates' page: the letterhead and its signer.
    icon: Signature,
    permission: "manage_settings",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-sso",
    labelKey: "app.sso.navLabel",
    href: "/settings/sso",
    icon: KeySquare,
    permission: "manage_settings",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-audit",
    labelKey: "app.audit.navLabel",
    href: "/settings/audit-logs",
    icon: History,
    permission: "view_audit_logs",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-integrations",
    labelKey: "app.integrations.navLabel",
    href: "/settings/integrations",
    icon: Plug,
    permission: "view_integrations",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-notifications",
    labelKey: "app.settings.notifications.navLabel",
    href: "/settings/notifications",
    // Not the notification list's bell: this is the reader's own choice of channels.
    icon: BellRing,
    group: NAV_GROUP.settings,
    sidebarPlacement: "hidden",
    accountMenu: true,
  },
  {
    key: "settings-notification-defaults",
    labelKey: "app.settings.notificationDefaults.navLabel",
    href: "/settings/notification-defaults",
    icon: BellDot,
    permission: "manage_notification_settings",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-document-templates",
    labelKey: "app.documents.templates.navLabel",
    href: "/settings/document-templates",
    // Templates are shared by every issuing module; the screen itself hides
    // the kinds whose module is off.
    moduleSections: DOCUMENT_TEMPLATE_SECTIONS,
    icon: domainIcons.document,
    permission: "manage_settings",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-workflows",
    labelKey: "app.workflows.navLabel",
    href: "/settings/workflows",
    module: "permits",
    icon: domainIcons.workflow,
    permission: "manage_workflows",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-whatsapp",
    labelKey: "app.messaging.navLabel",
    href: "/settings/whatsapp",
    icon: MessageCircle,
    permission: "manage_whatsapp",
    group: NAV_GROUP.settings,
    sidebarPlacement: "footer",
  },
  {
    key: "settings-appearance",
    labelKey: "app.shell.appearance",
    href: "/settings/appearance",
    // Neither the gear (the school settings entry) nor the palette (the
    // school's branding): light and dark is what this page sets.
    icon: SunMoon,
    group: NAV_GROUP.settings,
    sidebarPlacement: "hidden",
    accountMenu: true,
  },
  {
    key: "profile",
    labelKey: "nav.compact.profile",
    tabLabelKey: "app.shell.nav.short.profile",
    href: "/profile",
    icon: UserRound,
    showInTabBar: true,
    group: NAV_GROUP.settings,
    sidebarPlacement: "hidden",
    accountMenu: true,
  },

  {
    key: "platform-tenants",
    labelKey: "nav.platform.items.tenants",
    href: "/platform",
    icon: School,
    permission: "platform_superadmin",
    group: NAV_GROUP.platform,
    sidebarPlacement: "footer",
  },
  {
    key: "platform-operator-alerts",
    labelKey: "nav.platform.items.operatorAlerts",
    href: "/platform/operator-alerts",
    icon: Siren,
    permission: "platform_superadmin",
    group: NAV_GROUP.platform,
    sidebarPlacement: "footer",
  },
];
