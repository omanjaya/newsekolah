import { Home, Settings, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
   * Sidebar group label (e.g. "Akademik", "Perizinan" from docs/07-ui-ux.md
   * section 2). Omitted for the current small item set, which renders flat;
   * the Sidebar's collapsible-group rendering activates once items declare one.
   */
  group?: string;
}

/**
 * Single source of truth for the sidebar, the mobile tab bar, and the
 * command palette (docs/03-layered-architecture.md section 3, docs/07-ui-ux.md
 * section 2: "satu registri navigation.ts ... dipakai sidebar, tab bar,
 * command palette"). Only lists items that resolve to a real page: modules
 * from the full docs/07 information architecture (Akademik, Perizinan,
 * Kesiswaan, Perpustakaan, ...) land here once their pages ship, per
 * antislop R-24 ("dead navigation" — every item needs a real destination).
 */
export const navigation: NavItem[] = [
  {
    key: "dashboard",
    labelKey: "nav.home",
    href: "/dashboard",
    icon: Home,
    showInTabBar: true,
  },
  {
    key: "profile",
    labelKey: "nav.compact.profile",
    href: "/profile",
    icon: UserRound,
    showInTabBar: true,
  },
  {
    key: "settings-appearance",
    labelKey: "app.shell.appearance",
    href: "/settings/appearance",
    icon: Settings,
    showInTabBar: false,
  },
];

export function filterNavigation(
  items: NavItem[],
  can: (permission: string) => boolean,
): NavItem[] {
  return items.filter((item) => !item.permission || can(item.permission));
}
