"use client";

import { Button, Sheet, SheetContent, SheetTrigger, cn } from "@newsekolah/ui";
import { ChevronRight, Menu, Search, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { splitSidebarGroups } from "../lib/group-navigation";
import { navGroupIcons, navGroupLabelKey, type NavItem } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";
import { useNavigationPreferences } from "../lib/navigation/use-navigation-preferences";

import { useCommandPaletteOptional } from "./command-palette-provider";
import { TabSlot } from "./mobile-tab-slot";

/** Recent pages shown as chips; more would wrap into a second row on a phone. */
const RECENT_LIMIT = 4;

interface Section {
  key: string;
  heading?: { label: string; icon?: ReactNode };
  items: NavItem[];
  /** Rows under a group heading drop their icons: the heading names them. */
  nested: boolean;
}

/**
 * Every permitted destination, as a bottom sheet behind the tab bar's Menu
 * slot. The same structure as the desktop sidebar (daily pages, then one
 * card per group, then the school's settings), plus a search field that
 * opens the command palette, the last pages visited as chips, and the
 * reader's favorites. Stars only show in "Atur favorit" mode, so the list
 * stays quiet the rest of the time.
 */
export function MobileMenu({
  items,
  scope,
  current = false,
}: {
  items: NavItem[];
  scope?: string;
  /** The page being viewed is reached through this menu rather than a tab. */
  current?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const pathname = usePathname();
  const t = useTranslations();
  const palette = useCommandPaletteOptional();
  const preferences = useNavigationPreferences(scope, items, pathname);
  const activeHref = activeNavHref(pathname, items);
  // The page being viewed is already highlighted in its own group; listing it
  // again under "recent" shows the same destination as active twice.
  const recent = preferences.recent
    .filter((item) => item.href !== activeHref)
    .slice(0, RECENT_LIMIT);
  const favoriteKeys = new Set(preferences.favorites.map((item) => item.key));

  const listed = items.filter((item) => item.sidebarPlacement !== "hidden");
  const main = listed.filter((item) => item.sidebarPlacement !== "footer");
  const footer = listed.filter((item) => item.sidebarPlacement === "footer");
  const { ungrouped, groups } = splitSidebarGroups(main);
  const sections: Section[] = [
    ...(preferences.favorites.length
      ? [
          {
            key: "favorites",
            heading: { label: t("app.shell.mobileMenu.favorites") },
            items: preferences.favorites,
            nested: false,
          },
        ]
      : []),
    ...(ungrouped.length ? [{ key: "main", items: ungrouped, nested: false }] : []),
    ...groups.map(([group, groupItems]) => {
      const Icon = navGroupIcons[group];
      return {
        key: group,
        heading: {
          label: t(navGroupLabelKey(group)),
          icon: Icon ? <Icon aria-hidden="true" /> : undefined,
        },
        items: groupItems,
        nested: true,
      };
    }),
    ...(footer.length ? [{ key: "footer", items: footer, nested: false }] : []),
  ];

  function close() {
    setOpen(false);
    setEditing(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditing(false);
      }}
    >
      <SheetTrigger asChild>
        <TabSlot icon={<Menu />} label={t("app.shell.mobileMenu.title")} active={current} />
      </SheetTrigger>
      <SheetContent title={t("app.shell.mobileMenu.title")} closeLabel={t("common.actions.close")}>
        <nav aria-label={t("app.shell.sidebar.label")} className="flex flex-col gap-6">
          {palette && (
            <button
              type="button"
              onClick={() => {
                close();
                palette.open();
              }}
              className="flex h-11 w-full items-center gap-3 rounded-md border border-border bg-surface-sunken px-3 text-left text-body text-fg-muted outline-none transition-colors active:bg-state-pressed"
            >
              <Search aria-hidden="true" className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t("app.shell.phoneMenu.search")}</span>
            </button>
          )}

          {recent.length > 0 && (
            <section aria-labelledby="mobile-menu-recent" className="flex flex-col gap-2">
              <h2 id="mobile-menu-recent" className="text-label text-fg-muted">
                {t("app.shell.mobileMenu.recent")}
              </h2>
              <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none">
                {recent.map((item) => (
                  <li key={item.key} className="shrink-0">
                    <Link
                      href={item.href}
                      onClick={close}
                      className="flex h-9 items-center gap-2 rounded-full bg-surface px-3.5 text-label text-fg ring-1 ring-border outline-none motion-press active:bg-state-pressed"
                    >
                      <item.icon aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                      {t(item.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-2">
              {section.heading && (
                <h2 className="flex items-center gap-2 text-label text-fg-muted [&>svg]:size-4">
                  {section.heading.icon}
                  {section.heading.label}
                </h2>
              )}
              <ul className="overflow-hidden rounded-lg bg-surface ring-1 ring-border">
                {section.items.map((item) => (
                  <MenuRow
                    key={`${section.key}-${item.key}`}
                    item={item}
                    nested={section.nested}
                    active={item.href === activeHref}
                    editing={editing && Boolean(scope)}
                    favorite={favoriteKeys.has(item.key)}
                    onNavigate={close}
                    onToggleFavorite={() => {
                      preferences.toggleFavorite(item.key);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}

          {scope && (
            <div className="flex flex-col items-start gap-1">
              {editing && (
                <p className="text-body-sm text-fg-muted">{t("app.shell.phoneMenu.editHint")}</p>
              )}
              <Button
                variant="link"
                size="sm"
                icon={editing ? undefined : <Star />}
                onClick={() => {
                  setEditing((value) => !value);
                }}
              >
                {editing ? t("app.shell.phoneMenu.done") : t("app.shell.phoneMenu.edit")}
              </Button>
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MenuRow({
  item,
  nested,
  active,
  editing,
  favorite,
  onNavigate,
  onToggleFavorite,
}: {
  item: NavItem;
  nested: boolean;
  active: boolean;
  editing: boolean;
  favorite: boolean;
  onNavigate: () => void;
  onToggleFavorite: () => void;
}): ReactElement {
  const t = useTranslations();
  const label = t(item.labelKey);
  return (
    <li className="flex items-center border-b border-line last:border-b-0">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={(event) => {
          if (!event.defaultPrevented) onNavigate();
        }}
        className={cn(
          "flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 text-body outline-none transition-colors focus-visible:-outline-offset-2",
          active
            ? "bg-accent-soft font-semibold text-accent-soft-fg"
            : "text-fg active:bg-state-pressed",
        )}
      >
        {!nested && (
          <item.icon
            aria-hidden="true"
            className={cn("size-5 shrink-0", active ? "text-accent-soft-fg" : "text-fg-muted")}
          />
        )}
        <span className="min-w-0 flex-1 break-words">
          {nested ? t(item.groupLabelKey ?? item.labelKey) : label}
        </span>
        {!editing && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />}
      </Link>
      {editing && (
        <button
          type="button"
          aria-pressed={favorite}
          aria-label={t(
            favorite ? "app.shell.phoneMenu.favoriteRemove" : "app.shell.phoneMenu.favoriteAdd",
            { name: label },
          )}
          onClick={onToggleFavorite}
          className="flex size-12 shrink-0 items-center justify-center text-fg-muted outline-none focus-visible:-outline-offset-2 active:bg-state-pressed"
        >
          <Star
            aria-hidden="true"
            className={cn("size-5", favorite && "fill-current text-accent")}
          />
        </button>
      )}
    </li>
  );
}
