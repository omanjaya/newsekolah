import { domainIcons } from "@newsekolah/ui";
import {
  Bell,
  Building2,
  FileSpreadsheet,
  KeyRound,
  ListChecks,
  MessageCircle,
  Palette,
  Plug,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import type { NavItem } from "./navigation";

/**
 * Settings, reporting and platform entries, split out of `navigation.ts`
 * so that file stays under the 400-line cap (docs/04-clean-code.md).
 * Spread into `navigation.ts` after the school-data group.
 */
export const settingsNavItems: NavItem[] = [
  {
    key: "settings-roles",
    labelKey: "nav.settings.items.rolesAndAccess",
    href: "/settings/roles",
    icon: ShieldCheck,
    permission: "view_roles",
    group: "nav.settings.label",
  },
  {
    key: "reports",
    labelKey: "app.reports.navLabel",
    href: "/reports",
    icon: FileSpreadsheet,
    permission: "view_reports",
    group: "nav.settings.label",
  },
  {
    key: "setup",
    labelKey: "app.onboarding.navLabel",
    href: "/setup",
    icon: ListChecks,
    permission: "manage_settings",
    group: "nav.settings.label",
  },
  {
    key: "settings-security",
    labelKey: "app.security.navLabel",
    href: "/settings/security",
    icon: ShieldCheck,
    group: "nav.settings.label",
  },
  {
    key: "settings-session",
    labelKey: "app.settings.session.navLabel",
    href: "/settings/session",
    icon: KeyRound,
    permission: "manage_settings",
    group: "nav.settings.label",
  },
  {
    key: "settings-branding",
    labelKey: "app.settings.branding.navLabel",
    href: "/settings/branding",
    icon: Palette,
    permission: "manage_settings",
    group: "nav.settings.label",
  },
  {
    key: "settings-sso",
    labelKey: "app.sso.navLabel",
    href: "/settings/sso",
    icon: ShieldCheck,
    permission: "manage_settings",
    group: "nav.settings.label",
  },
  {
    key: "settings-audit",
    labelKey: "app.audit.navLabel",
    href: "/settings/audit-logs",
    icon: ShieldCheck,
    permission: "view_audit_logs",
    group: "nav.settings.label",
  },
  {
    key: "settings-integrations",
    labelKey: "app.integrations.navLabel",
    href: "/settings/integrations",
    icon: Plug,
    permission: "view_integrations",
    group: "nav.settings.label",
  },
  {
    key: "settings-notifications",
    labelKey: "app.settings.notifications.navLabel",
    href: "/settings/notifications",
    icon: Bell,
    group: "nav.settings.label",
  },
  {
    key: "settings-notification-defaults",
    labelKey: "app.settings.notificationDefaults.navLabel",
    href: "/settings/notification-defaults",
    icon: Bell,
    permission: "manage_notification_settings",
    group: "nav.settings.label",
  },
  {
    key: "settings-document-templates",
    labelKey: "app.documents.templates.navLabel",
    href: "/settings/document-templates",
    icon: domainIcons.document,
    permission: "manage_settings",
    group: "nav.settings.label",
  },
  {
    key: "settings-workflows",
    labelKey: "app.workflows.navLabel",
    href: "/settings/workflows",
    icon: domainIcons.workflow,
    permission: "manage_workflows",
    group: "nav.settings.label",
  },
  {
    key: "settings-whatsapp",
    labelKey: "app.messaging.navLabel",
    href: "/settings/whatsapp",
    icon: MessageCircle,
    permission: "manage_whatsapp",
    group: "nav.settings.label",
  },
  {
    key: "settings-appearance",
    labelKey: "app.shell.appearance",
    href: "/settings/appearance",
    icon: Settings,
    group: "nav.settings.label",
  },
  {
    key: "profile",
    labelKey: "nav.compact.profile",
    href: "/profile",
    icon: UserRound,
    showInTabBar: true,
    group: "nav.settings.label",
  },

  {
    key: "platform-tenants",
    labelKey: "nav.platform.items.tenants",
    href: "/platform",
    icon: Building2,
    permission: "platform_superadmin",
    group: "nav.platform.label",
  },
];
