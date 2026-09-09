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

function NavLink({ item }: { item: NavItem }): ReactElement {
  const pathname = usePathname();
  const t = useTranslations();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

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
  // Starts empty (all groups open) to match the server-rendered pass; the
  // effect below applies the stored preference right after mount, the same
  // trade-off as ThemeProvider and OfflineIndicator make for the same reason.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the note above `collapsed`'s useState.
    setCollapsed(readCollapsedGroups());
  }, []);

  const ungrouped = items.filter((item) => !item.group);
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!item.group) continue;
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  function toggleGroup(group: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable: the toggle still works for this page load.
      }
      return next;
    });
  }

  return (
    <aside className={cn("w-60 shrink-0 flex-col border-r border-border bg-surface", className)}>
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
              aria-expanded={!collapsed[group]}
              className="flex h-8 items-center justify-between px-3 text-[12px] font-medium text-fg-muted"
            >
              {group}
              <ChevronDown
                className={cn("size-4 transition-transform", collapsed[group] && "-rotate-90")}
                aria-hidden="true"
              />
            </button>
            {!collapsed[group] && (
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
