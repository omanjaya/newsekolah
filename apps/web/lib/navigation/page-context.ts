import { splitSidebarGroups } from "../group-navigation";
import { navigation, navGroupLabelKey, type NavItem } from "../navigation";

import { activeNavHref, matchesHref } from "./active-href";

/**
 * The eyebrow of a page whose menu entry sits in the menu's top block,
 * under no group heading: every page head keeps the same geometry, and it
 * never names a group the reader cannot see.
 */
export const TOP_LEVEL_EYEBROW_KEY = "app.page.workspaceEyebrow";

/**
 * Menu entries whose members are not sibling pages of one area, so they
 * never become a tab strip: the home, and the settings hub, whose pages
 * carry the tabs of their own hub section (features/settings/components/
 * settings-page.tsx, from the taxonomy in features/settings/settings-hub.ts).
 */
const ENTRIES_WITHOUT_TABS: ReadonlySet<string> = new Set(["dashboard", "settings"]);

export interface PageTab {
  key: string;
  href: string;
  labelKey: string;
  current: boolean;
}

/** Where a route sits in the navigation registry, for the page template. */
export interface PageContext {
  /** The menu entry the sidebar highlights for the route: an area (workspace) or a single page. */
  entry?: NavItem;
  /** The registry page the route belongs to (longest href that matches it). */
  page?: NavItem;
  /**
   * The page's eyebrow: the message key of the heading the reader's own
   * menu shows the entry under, so the eyebrow and the sidebar heading read
   * alike, or `TOP_LEVEL_EYEBROW_KEY` for an entry in the menu's top block.
   */
  groupKey?: string;
  /** The area's pages as tabs, in registry order: two or more, only on an area's own pages. */
  tabs: PageTab[];
  /** The route is below its page's own address (a title, a member, a session). */
  isDetail: boolean;
}

function pathOf(href: string): string {
  return href.split("?")[0] ?? href;
}

/** The registry item with the longest href that matches `pathname`, among `items`. */
function bestMatch(pathname: string, items: readonly NavItem[]): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of items) {
    if (!matchesHref(pathname, pathOf(item.href))) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best;
}

/**
 * The heading the reader's menu shows `entry` under. The sidebar and the
 * phone menu draw their main entries through `splitSidebarGroups`, which
 * lifts a group of one page and every ungrouped entry into the top block,
 * so the registry group is not always the one the reader sees. Entries
 * outside the main list (the footer's settings, the account menu's pages)
 * keep their registry group.
 */
function menuGroupKey(
  entry: NavItem | undefined,
  page: NavItem | undefined,
  entries: readonly NavItem[],
): string | undefined {
  if (!entry) return page?.group === undefined ? undefined : navGroupLabelKey(page.group);
  const inMain = (item: NavItem) => (item.sidebarPlacement ?? "main") === "main";
  if (!inMain(entry)) {
    const group = entry.group ?? page?.group;
    return group === undefined ? TOP_LEVEL_EYEBROW_KEY : navGroupLabelKey(group);
  }
  const { groups } = splitSidebarGroups(entries.filter(inMain));
  const shown = groups.find(([, items]) => items.includes(entry));
  return shown ? navGroupLabelKey(shown[0]) : TOP_LEVEL_EYEBROW_KEY;
}

/**
 * Resolves the page template's defaults for `pathname` from the menu the
 * reader actually has (`entries`: the filtered and consolidated navigation
 * the shell renders, see lib/navigation-workspaces.ts). The area is the
 * entry the sidebar highlights; its members (already filtered to the ones
 * the reader may open, less the route-only ones that only redirect) are
 * the tabs; the group is the eyebrow. Pure, so the shell, the page
 * template and tests read the same answer.
 */
export function resolvePageContext(pathname: string, entries: readonly NavItem[]): PageContext {
  const entryHref = activeNavHref(pathname, entries);
  const entry = entries.find((item) => item.href === entryHref);
  const members = (entry?.aliases ?? [])
    .map((key) => navigation.find((item) => item.key === key))
    .filter((item): item is NavItem => item !== undefined);
  const page = bestMatch(pathname, members) ?? bestMatch(pathname, navigation);
  const isDetail = page !== undefined && pathname !== pathOf(page.href);
  const destinations = members.filter((member) => !member.routeOnly);
  const showsTabs =
    entry !== undefined &&
    !ENTRIES_WITHOUT_TABS.has(entry.key) &&
    destinations.length >= 2 &&
    !isDetail;
  return {
    entry,
    page,
    groupKey: menuGroupKey(entry, page, entries),
    tabs: showsTabs
      ? destinations.map((member) => ({
          key: member.key,
          href: member.href,
          labelKey: member.labelKey,
          current: member.key === page?.key,
        }))
      : [],
    isDetail,
  };
}

/**
 * Carries the named query parameters of the current address onto `href`
 * (the attendance date stays put while switching between its tabs).
 */
export function withCarriedParams(
  href: string,
  search: URLSearchParams | null,
  keys: readonly string[],
): string {
  if (!search || keys.length === 0) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  for (const key of keys) {
    const value = search.get(key);
    if (value !== null && value !== "" && !params.has(key)) params.set(key, value);
  }
  const next = params.toString();
  return next ? `${path ?? href}?${next}` : (path ?? href);
}
