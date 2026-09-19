import type { NavItem } from "./navigation";
import { navGroupOrder } from "./navigation-groups";

/** Group an already permission-filtered registry without dropping ungrouped pages. */
export function groupNavigation(items: NavItem[]): { labelKey: string; items: NavItem[] }[] {
  const fallback = "app.shell.mobileMenu.general";
  const keys = [
    ...new Set([fallback, ...navGroupOrder, ...items.map((item) => item.group ?? fallback)]),
  ];
  return keys
    .map((labelKey) => ({
      labelKey,
      items: items.filter((item) => (item.group ?? fallback) === labelKey),
    }))
    .filter((group) => group.items.length > 0);
}
