"use client";

import { domainIcons, type CommandPaletteGroup, type CommandPaletteItem } from "@newsekolah/ui";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { studentProfileHref } from "../features/students/href";
import { usePaletteStudentGroup } from "../features/students/lib/use-palette-student-group";
import { groupNavigation } from "../lib/group-navigation";
import { navigation, filterNavigation, navGroupLabelKey, type NavItem } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";
import { useNavigationPreferences } from "../lib/navigation/use-navigation-preferences";
import { confirmUnsavedChangesBeforeNavigation } from "../lib/navigation/use-unsaved-changes-protection";
import { navAccessFromMe } from "../lib/navigation-access";
import { canOpenPath } from "../lib/navigation-permissions";
import { sortQuickActions } from "../lib/navigation-quick-actions";
import { rankSearch } from "../lib/navigation-search";
import { consolidateNavigation } from "../lib/navigation-workspaces";
import { quickActionHref, type QuickAction } from "../lib/quick-actions";
import { useSession } from "../lib/session/session-provider";
import { useQuickActions } from "../lib/use-quick-actions";

interface CommandPaletteContextValue {
  open: () => void;
  /**
   * What the search finds, for every field and button that opens it (the
   * header, the phone menu): students only for a reader who may open a
   * student's profile, so a student is not promised a search they lack.
   */
  placeholder: string;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

// The provider itself (context + Ctrl/Cmd+K listener) must mount with the
// shell so the shortcut always works, but the palette dialog carries cmdk,
// which no route needs for first paint (docs/16-audit-performa-web.md item
// 8). Deferring only the dialog keeps the shell's initial chunk free of it
// without gating the whole shell behind a client-only chunk.
const CommandPalette = dynamic(() => import("@newsekolah/ui").then((mod) => mod.CommandPalette), {
  ssr: false,
});

/** Recent pages listed when nothing is typed yet. */
const RECENT_LIMIT = 5;
/** Where the student results rank among the page groups: below a page whose words match. */
const STUDENT_SCORE = 36;

/** Heading for pages outside any group (Beranda, Perlu tindakan, Pindai). */
const UNGROUPED = "app.shell.palette.results";

interface PageEntry {
  item: NavItem;
  label: string;
  keywords: string[];
  heading: string;
}

interface Bucket {
  group: CommandPaletteGroup;
  best: number;
}

/**
 * Global Ctrl/Cmd+K search (docs/07-ui-ux.md section 2). Wired to the same
 * `navigation` registry as the sidebar and tab bar, filtered by the same
 * permissions, so it can never offer a page the reader cannot open.
 *
 * The palette does its own ranking (`shouldFilter={false}`): pages match on
 * their translated label first, then on a word of it, then on their
 * keywords (lib/navigation-search.ts), and the results stay grouped under
 * their menu group, the groups ordered by their best match. With nothing
 * typed it opens on the reader's recent pages and quick actions, then every
 * page by group.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }): ReactElement {
  // Open state and the typed query change together: every opening starts
  // from an empty query, like the input the dialog mounts with.
  const [palette, setPalette] = useState({ open: false, query: "" });
  const isOpen = palette.open;
  const query = palette.query;
  const setIsOpen = useCallback((open: boolean) => {
    setPalette((prev) => (open ? { open, query: prev.open ? prev.query : "" } : { ...prev, open }));
  }, []);
  // The dialog (and its chunk) loads on the first open, not on shell mount.
  const [hasOpened, setHasOpened] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { me } = useSession();
  const t = useTranslations("app.shell.palette");
  const tQuick = useTranslations("app.quickActions");
  const tNav = useTranslations();
  const quickActions = useQuickActions();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setHasOpened(true);
        setPalette((prev) => ({ open: !prev.open, query: "" }));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const go = useCallback(
    (href: string) => {
      void confirmUnsavedChangesBeforeNavigation().then((leave) => {
        if (!leave) return;
        setIsOpen(false);
        router.push(href);
      });
    },
    [router, setIsOpen],
  );

  const pages: PageEntry[] = useMemo(() => {
    const access = navAccessFromMe(me);
    const { can } = access;
    const authorizedItems = filterNavigation(navigation, access);
    const workspaces = consolidateNavigation(authorizedItems, {
      profileKind: me?.profile_kind,
      duties: me?.duties,
      canManageSchool: me?.permissions.some((code) =>
        ["manage_master_data", "manage_enrollments", "view_users"].includes(code),
      ),
      can,
    });
    const hrefs = new Set(workspaces.map((item) => item.href));
    const items = [
      ...workspaces,
      ...authorizedItems.filter((item) => !hrefs.has(item.href)),
    ].filter((item) => !item.routeOnly && canOpenPath(item.href, access));
    return groupNavigation(items).flatMap((group) =>
      group.items.map((item) => ({
        item,
        label: tNav(item.labelKey),
        keywords: (item.searchTerms ?? []).map((key) => tNav(key)),
        heading: item.group ? navGroupLabelKey(item.group) : UNGROUPED,
      })),
    );
  }, [me, tNav]);

  const scope = me ? `${me.tenant.tenant_id}:${me.id}` : undefined;
  const pageItems = useMemo(() => pages.map((page) => page.item), [pages]);
  const preferences = useNavigationPreferences(scope, pageItems, pathname);
  const activeHref = activeNavHref(pathname, pageItems);

  // Item ids only need to be unique; numbers add no searchable letters.
  // `withArea` names the page's menu group at the row's end, for the
  // groups whose heading does not (favourites, recent pages).
  const pageItem = useCallback(
    (page: PageEntry, id: string, withArea = false): CommandPaletteItem => ({
      id,
      label: page.label,
      hint: withArea && page.heading !== UNGROUPED ? tNav(page.heading) : undefined,
      icon: <page.item.icon aria-hidden="true" />,
      onSelect: () => {
        go(page.item.href);
      },
    }),
    [go, tNav],
  );
  const actionItem = useCallback(
    (action: QuickAction, id: string): CommandPaletteItem => ({
      id,
      label: tQuick(`actions.${action.labelKey}`),
      icon: <action.icon aria-hidden="true" />,
      onSelect: () => {
        go(quickActionHref(action));
      },
    }),
    [go, tQuick],
  );

  const orderedActions = useMemo(() => sortQuickActions(quickActions), [quickActions]);

  // Same right as the student-profile registry entry: no student request is
  // made for a reader who could not open the page it leads to.
  const canOpenStudentProfile = useMemo(
    () => canOpenPath(studentProfileHref("search"), navAccessFromMe(me)),
    [me],
  );
  const placeholder = t(canOpenStudentProfile ? "placeholder" : "placeholderPages");
  const studentIcon = useMemo(() => <domainIcons.users aria-hidden="true" />, []);
  const openStudent = useCallback(
    (studentId: string) => {
      go(studentProfileHref(studentId));
    },
    [go],
  );
  const students = usePaletteStudentGroup({
    enabled: hasOpened && isOpen && canOpenStudentProfile,
    heading: tQuick("students"),
    icon: studentIcon,
    onSelect: openStudent,
  });
  const resetStudentSearch = students.reset;
  useEffect(() => {
    if (!isOpen) resetStudentSearch();
  }, [isOpen, resetStudentSearch]);

  const groups: CommandPaletteGroup[] = useMemo(() => {
    let nextId = 0;
    const id = () => String(nextId++);

    if (!query.trim()) {
      const entriesFor = (items: readonly NavItem[]) =>
        items.flatMap((item) => pages.filter((page) => page.item.key === item.key).slice(0, 1));
      const favoriteEntries = entriesFor(preferences.favorites);
      const recentEntries = entriesFor(
        preferences.recent
          .filter((item) => item.href !== activeHref)
          .filter((item) => !preferences.favorites.includes(item))
          .slice(0, RECENT_LIMIT),
      );
      const byHeading = new Map<string, PageEntry[]>();
      for (const page of pages) {
        byHeading.set(page.heading, [...(byHeading.get(page.heading) ?? []), page]);
      }
      return [
        ...(favoriteEntries.length
          ? [
              {
                heading: tNav("app.shell.mobileMenu.favorites"),
                items: favoriteEntries.map((page) => pageItem(page, id(), true)),
              },
            ]
          : []),
        ...(recentEntries.length
          ? [
              {
                heading: t("recent"),
                items: recentEntries.map((page) => pageItem(page, id(), true)),
              },
            ]
          : []),
        ...(orderedActions.length
          ? [{ heading: tQuick("group"), items: orderedActions.map((a) => actionItem(a, id())) }]
          : []),
        ...[...byHeading.entries()].map(([heading, entries]) => ({
          heading: tNav(heading),
          items: entries.map((page) => pageItem(page, id())),
        })),
      ];
    }

    const buckets = new Map<string, Bucket>();
    for (const { entry, score } of rankSearch(query, pages, (page) => page)) {
      const bucket = buckets.get(entry.heading) ?? {
        group: { heading: tNav(entry.heading), items: [] },
        best: score,
      };
      bucket.group.items.push(pageItem(entry, id()));
      buckets.set(entry.heading, bucket);
    }
    const actions = rankSearch(query, orderedActions, (action) => ({
      label: tQuick(`actions.${action.labelKey}`),
    }));
    const ranked: Bucket[] = [...buckets.values()];
    if (actions.length) {
      ranked.push({
        group: {
          heading: tQuick("group"),
          items: actions.map(({ entry }) => actionItem(entry, id())),
        },
        best: actions[0]?.score ?? 0,
      });
    }
    if (students.group?.items.length) ranked.push({ group: students.group, best: STUDENT_SCORE });
    // Stable: equal bests keep pages ahead of actions and students.
    return ranked.sort((a, b) => b.best - a.best).map((bucket) => bucket.group);
  }, [
    query,
    pages,
    preferences.recent,
    preferences.favorites,
    activeHref,
    orderedActions,
    students.group,
    pageItem,
    actionItem,
    t,
    tQuick,
    tNav,
  ]);

  const onSearchChange = students.onSearchChange;
  const handleSearchChange = useCallback(
    (search: string) => {
      setPalette((prev) => ({ ...prev, query: search }));
      onSearchChange(search);
    },
    [onSearchChange],
  );

  const open = useCallback(() => {
    setHasOpened(true);
    setIsOpen(true);
  }, [setIsOpen]);
  // Same rationale as SessionProvider/TenantProvider: keep the value's
  // identity stable so consumers of `useCommandPalette()` don't re-render on
  // every render of this provider (docs/16-audit-performa-web.md item 3).
  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, placeholder }),
    [open, placeholder],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {hasOpened && (
        <CommandPalette
          open={isOpen}
          onOpenChange={setIsOpen}
          groups={groups}
          shouldFilter={false}
          onSearchChange={handleSearchChange}
          placeholder={placeholder}
          label={placeholder}
        />
      )}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return context;
}

/** The palette when the shell provides one; `null` outside it (a component rendered on its own). */
export function useCommandPaletteOptional(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext);
}
