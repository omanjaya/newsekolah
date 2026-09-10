"use client";

import { cn } from "@newsekolah/ui";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import type { NavItem } from "../lib/navigation";

import { TenantBrand } from "./tenant-brand";

const COLLAPSE_STORAGE_KEY = "newsekolah-sidebar-collapsed-groups";

function readCollapsedGroups(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item }: { item: NavItem }): ReactElement {
  const pathname = usePathname();
  const t = useTranslations();
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-sm px-3 text-[13px] font-medium",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        active ? "bg-accent/10 text-accent" : "text-fg hover:bg-bg",
      )}
    >
      <item.icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

/**
 * Desktop sidebar. Items without a `group` render as a flat list (the
 * current, small navigation registry — see lib/navigation.ts); items that
 * do declare a `group` render inside a collapsible section whose open state
 * persists to localStorage per group, ready for the full docs/07
 * information architecture (7 groups) once those modules land.
 */
export function Sidebar({
  items,
  className,
}: {
  items: NavItem[];
  className?: string;
}): ReactElement {
  const t = useTranslations();
  const pathname = usePathname();
  // Stored preferences only, and only for groups the reader has actually
  // toggled. Starts empty to match the server-rendered pass, then the
  // effect applies what was stored, the same trade-off ThemeProvider and
  // OfflineIndicator make for the same reason.
  const [stored, setStored] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the note above `stored`'s useState.
    setStored(readCollapsedGroups());
  }, []);

  const ungrouped = items.filter((item) => !item.group);
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!item.group) continue;
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  // With every module shipped the registry runs past a screen and a half,
  // so opening all seven groups buries Settings below the fold on a laptop.
  // Only the group holding the current page opens by default; the reader's
  // own choice, once made, wins over that.
  const activeGroup = items.find((item) => item.group && isActive(pathname, item.href))?.group;

  function isCollapsed(group: string): boolean {
    return stored[group] ?? group !== activeGroup;
  }

  function toggleGroup(group: string) {
    setStored((prev) => {
      const next = { ...prev, [group]: !isCollapsed(group) };
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable: the toggle still works for this page load.
      }
      return next;
    });
  }

  return (
    // `self-start` matters: a flex child stretches to the container's full
    // height by default, and an element as tall as its container never
    // sticks. Pinned to the viewport with its own height, the nav below
    // scrolls on its own while the page scrolls behind it.
    <aside
      className={cn(
        "sticky top-0 h-dvh w-60 shrink-0 self-start flex-col border-r border-border bg-surface",
        className,
      )}
    >
      <div className="flex h-14 items-center border-b border-border px-4">
        <TenantBrand />
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Navigasi utama">
        {ungrouped.map((item) => (
          <NavLink key={item.key} item={item} />
        ))}
        {[...groups.entries()].map(([group, groupItems]) => (
          <div key={group} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                toggleGroup(group);
              }}
              aria-expanded={!isCollapsed(group)}
              className="flex h-8 items-center justify-between px-3 text-[12px] font-medium text-fg-muted"
            >
              {t(group)}
              <ChevronDown
                className={cn("size-4 transition-transform", isCollapsed(group) && "-rotate-90")}
                aria-hidden="true"
              />
            </button>
            {!isCollapsed(group) && (
              <div className="flex flex-col gap-1">
                {groupItems.map((item) => (
                  <NavLink key={item.key} item={item} />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
