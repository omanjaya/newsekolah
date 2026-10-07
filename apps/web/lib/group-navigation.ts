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

/**
 * Splits sidebar rows into top-level links and collapsible groups. A group
 * the reader can see only one page of is noise -- a header and a click to
 * reach a single link -- so its page joins the top-level links instead.
 */
export function splitSidebarGroups(items: NavItem[]): {
  ungrouped: NavItem[];
  groups: [string, NavItem[]][];
} {
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!item.group) continue;
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  const ordered = [...groups.entries()].sort(
    ([a], [b]) => navGroupOrder.indexOf(a) - navGroupOrder.indexOf(b),
  );
  return {
    ungrouped: [
      ...items.filter((item) => !item.group),
      ...ordered.filter(([, list]) => list.length === 1).flatMap(([, list]) => list),
    ],
    groups: ordered.filter(([, list]) => list.length > 1),
  };
}
