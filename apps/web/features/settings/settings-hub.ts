import type { LucideIcon } from "lucide-react";

import { filterNavigation, navigation, type NavItem } from "../../lib/navigation";
import type { NavAccess } from "../../lib/navigation-access";

export type SettingsHubSectionKey =
  "identity" | "access" | "communication" | "workflow" | "account";

interface SettingsHubCardSpec {
  /** Key of the navigation registry entry that owns the href, icon, label and permission. */
  navKey: string;
  /** Key under `app.settingsHub.cards`. */
  descriptionKey: string;
  /**
   * `false` for a page that lives in another area's navigation (users and
   * roles under Data Sekolah, the setup checklist), so the section tabs of
   * a settings page leave it out while the hub still lists it.
   */
  sectionTab?: false;
}

/**
 * Which registry entries each hub section groups. Only the grouping and the
 * description live here; href, icon, label and permissions come from the
 * navigation registry so access rules stay single-sourced. The same
 * grouping is the section navigation of every settings page (one
 * taxonomy for the hub and the pages it leads to).
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
      { navKey: "school-users", descriptionKey: "users", sectionTab: false },
      { navKey: "settings-roles", descriptionKey: "roles", sectionTab: false },
      { navKey: "settings-session", descriptionKey: "session" },
      { navKey: "settings-sso", descriptionKey: "sso" },
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
      { navKey: "setup", descriptionKey: "setup", sectionTab: false },
    ],
  },
  {
    // The reader's own account, kept apart from what applies to the whole
    // school: these pages are reached from the avatar menu by everyone.
    key: "account",
    cards: [
      { navKey: "settings-security", descriptionKey: "security" },
      { navKey: "settings-notifications", descriptionKey: "notifications" },
      { navKey: "settings-appearance", descriptionKey: "appearance" },
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
  /**
   * Whether every card the section groups is listed (the reader may open
   * them all and no search narrowed them). The section's description names
   * the whole group, so it is only true of a complete section.
   */
  complete: boolean;
}

export interface BuildSettingsHubInput {
  access: NavAccess;
  query?: string;
  /** Resolves a full i18n key (nav label key or `app.settingsHub.cards.*`) to text. */
  translate: (key: string) => string;
  /** Overridable for tests; defaults to the real registry. */
  registry?: NavItem[];
}

function allowedItems(access: NavAccess, registry: NavItem[]): Map<string, NavItem> {
  const specKeys = new Set(
    SETTINGS_HUB_SECTIONS.flatMap((section) => section.cards.map((card) => card.navKey)),
  );
  const allowed = filterNavigation(
    registry.filter((item) => specKeys.has(item.key)),
    access,
  );
  return new Map(allowed.map((item) => [item.key, item]));
}

/**
 * The hub cards the reader may open, grouped by section and narrowed by the
 * search query (case-insensitive match on label or description). Sections
 * left with no card are dropped.
 */
export function buildSettingsHubSections({
  access,
  query = "",
  translate,
  registry = navigation,
}: BuildSettingsHubInput): SettingsHubSection[] {
  const byKey = allowedItems(access, registry);
  const needle = query.trim().toLowerCase();

  return SETTINGS_HUB_SECTIONS.map((section) => {
    const cards = section.cards.flatMap((spec): SettingsHubCard[] => {
      const item = byKey.get(spec.navKey);
      if (!item) return [];
      const label = translate(item.labelKey);
      const description = translate(`app.settingsHub.cards.${spec.descriptionKey}`);
      if (needle && !`${label} ${description}`.toLowerCase().includes(needle)) return [];
      return [{ key: item.key, href: item.href, icon: item.icon, label, description }];
    });
    return {
      key: section.key,
      cards,
      complete: cards.length === section.cards.length,
    };
  }).filter((section) => section.cards.length > 0);
}

export interface SettingsSectionTab {
  key: string;
  href: string;
  label: string;
}

export interface SettingsPageContext {
  /** The hub section the page belongs to. */
  section: SettingsHubSectionKey;
  /** The page's own name: its registry label, the same text as its hub card and tab. */
  title: string;
  /** The section's settings pages the reader may open, in hub order, the page itself included. */
  tabs: SettingsSectionTab[];
}

/**
 * Where a settings page sits in the hub's taxonomy, for its title and its
 * section tabs. `undefined` for a key the hub does not group.
 */
export function settingsPageContext(
  navKey: string,
  {
    access,
    translate,
    registry = navigation,
  }: Omit<BuildSettingsHubInput, "query"> & { registry?: NavItem[] },
): SettingsPageContext | undefined {
  const section = SETTINGS_HUB_SECTIONS.find((candidate) =>
    candidate.cards.some((card) => card.navKey === navKey),
  );
  const item = registry.find((candidate) => candidate.key === navKey);
  if (!section || !item) return undefined;
  const byKey = allowedItems(access, registry);
  const tabs = section.cards.flatMap((spec): SettingsSectionTab[] => {
    if (spec.sectionTab === false) return [];
    const allowed = byKey.get(spec.navKey);
    return allowed
      ? [{ key: allowed.key, href: allowed.href, label: translate(allowed.labelKey) }]
      : [];
  });
  return { section: section.key, title: translate(item.labelKey), tabs };
}
