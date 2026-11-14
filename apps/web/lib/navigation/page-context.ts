import { navigation, type NavItem } from "../navigation";

import { activeNavHref, matchesHref } from "./active-href";

/**
 * Menu entries whose members are not sibling pages of one area, so they
 * never become a tab strip: the home of a reader who has the library home
 * as well, and the settings hub, whose sub-pages carry their own section
 * picker (features/settings/components/settings-workspace.tsx).
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
  /** Message key of the sidebar group, the page's eyebrow. */
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
 * Resolves the page template's defaults for `pathname` from the menu the
 * reader actually has (`entries`: the filtered and consolidated navigation
 * the shell renders, see lib/navigation-workspaces.ts). The area is the
 * entry the sidebar highlights; its members (already filtered to the ones
 * the reader may open) are the tabs; the group is the eyebrow. Pure, so
 * the shell, the page template and tests read the same answer.
 */
export function resolvePageContext(pathname: string, entries: readonly NavItem[]): PageContext {
  const entryHref = activeNavHref(pathname, entries);
  const entry = entries.find((item) => item.href === entryHref);
  const members = (entry?.aliases ?? [])
    .map((key) => navigation.find((item) => item.key === key))
    .filter((item): item is NavItem => item !== undefined);
  const page = bestMatch(pathname, members) ?? bestMatch(pathname, navigation);
  const isDetail = page !== undefined && pathname !== pathOf(page.href);
  const showsTabs =
    entry !== undefined && !ENTRIES_WITHOUT_TABS.has(entry.key) && members.length >= 2 && !isDetail;
  return {
    entry,
    page,
    groupKey: entry?.group ?? page?.group,
    tabs: showsTabs
      ? members.map((member) => ({
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
