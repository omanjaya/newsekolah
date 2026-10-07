import type { LucideIcon } from "lucide-react";

import {
  filterNavigation,
  navigation,
  type NavItem,
  type NavProfileKind,
} from "../../lib/navigation";

export type SettingsHubSectionKey = "identity" | "access" | "communication" | "workflow";

interface SettingsHubCardSpec {
  /** Key of the navigation registry entry that owns the href, icon, label and permission. */
  navKey: string;
  /** Key under `app.settingsHub.cards`. */
  descriptionKey: string;
}

/**
 * Which registry entries each hub section groups. Only the grouping and the
 * description live here; href, icon, label and permissions come from the
 * navigation registry so access rules stay single-sourced.
 */
export const SETTINGS_HUB_SECTIONS: readonly {
  key: SettingsHubSectionKey;
  cards: readonly SettingsHubCardSpec[];
}[] = [
  {
    key: "identity",
    cards: [
      { navKey: "settings-branding", descriptionKey: "branding" },
      { navKey: "settings-report-header", descriptionKey: "reportHeader" },
      { navKey: "settings-document-templates", descriptionKey: "documentTemplates" },
    ],
  },
  {
    key: "access",
    cards: [
      { navKey: "school-users", descriptionKey: "users" },
      { navKey: "settings-roles", descriptionKey: "roles" },
      { navKey: "settings-session", descriptionKey: "session" },
      { navKey: "settings-sso", descriptionKey: "sso" },
      { navKey: "settings-security", descriptionKey: "security" },
      { navKey: "settings-audit", descriptionKey: "audit" },
    ],
  },
  {
    key: "communication",
    cards: [
      { navKey: "settings-notification-defaults", descriptionKey: "notificationDefaults" },
      { navKey: "settings-whatsapp", descriptionKey: "whatsapp" },
      { navKey: "settings-integrations", descriptionKey: "integrations" },
    ],
  },
  {
    key: "workflow",
    cards: [
      { navKey: "settings-workflows", descriptionKey: "workflows" },
      { navKey: "setup", descriptionKey: "setup" },
    ],
  },
];

export interface SettingsHubCard {
  key: string;
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

export interface SettingsHubSection {
  key: SettingsHubSectionKey;
  cards: SettingsHubCard[];
}

export interface BuildSettingsHubInput {
  can: (permission: string) => boolean;
  profileKind?: NavProfileKind;
  roleSlugs?: string[];
  query?: string;
  /** Resolves a full i18n key (nav label key or `app.settingsHub.cards.*`) to text. */
  translate: (key: string) => string;
  /** Overridable for tests; defaults to the real registry. */
  registry?: NavItem[];
}

/**
 * The hub cards the reader may open, grouped by section and narrowed by the
 * search query (case-insensitive match on label or description). Sections
 * left with no card are dropped.
 */
export function buildSettingsHubSections({
  can,
  profileKind,
  roleSlugs = [],
  query = "",
  translate,
  registry = navigation,
}: BuildSettingsHubInput): SettingsHubSection[] {
  const specKeys = new Set(
    SETTINGS_HUB_SECTIONS.flatMap((section) => section.cards.map((card) => card.navKey)),
  );
  const allowed = filterNavigation(
    registry.filter((item) => specKeys.has(item.key)),
    can,
    profileKind,
    roleSlugs,
  );
  const byKey = new Map(allowed.map((item) => [item.key, item]));
  const needle = query.trim().toLowerCase();

  return SETTINGS_HUB_SECTIONS.map((section) => ({
    key: section.key,
    cards: section.cards.flatMap((spec): SettingsHubCard[] => {
      const item = byKey.get(spec.navKey);
      if (!item) return [];
      const label = translate(item.labelKey);
      const description = translate(`app.settingsHub.cards.${spec.descriptionKey}`);
      if (needle && !`${label} ${description}`.toLowerCase().includes(needle)) return [];
      return [{ key: item.key, href: item.href, icon: item.icon, label, description }];
    }),
  })).filter((section) => section.cards.length > 0);
}
