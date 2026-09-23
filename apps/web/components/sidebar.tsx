"use client";

import { TooltipProvider, cn } from "@newsekolah/ui";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import type { NavItem } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";
import { navGroupOrder } from "../lib/navigation-groups";

import { GroupFlyout, NavLink, RailLabel } from "./sidebar-nav";
import { TenantBrand } from "./tenant-brand";

const GROUPS_STORAGE_KEY = "newsekolah-sidebar-collapsed-groups-v2";
const RAIL_STORAGE_KEY = "newsekolah-sidebar-rail";

/** Wide enough for a two-line group label; the rail fits a 20px icon plus its hit area. */
const WIDTH_EXPANDED = "15rem";
const WIDTH_RAIL = "3.75rem";

/** Ignore sub-pixel scroll offsets so the edge fades do not flicker at rest. */
const SCROLL_EPSILON = 4;

function readCollapsedGroups(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function readRail(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice still holds for this page load.
  }
}

/**
 * Desktop sidebar. Two widths: the full list, or a rail of icons for readers
 * who want the screen back. Both the rail choice and each group's open state
 * persist to localStorage.
 *
 * Every stored preference is applied in an effect rather than read during
 * render. The server has no localStorage, so reading it while rendering
 * would make the first client pass disagree with the server HTML and React
 * would discard the tree (the hydration mismatch the passkey buttons hit).
 * `animate` stays false until that effect lands, so restoring a rail on load
 * snaps into place instead of sliding across the screen unprompted.
 *
 * Motion here runs past DESIGN.md's MOTION 1 dial by explicit request; see
 * that file's note. `prefers-reduced-motion` still governs, free of charge:
 * every duration below reads a token that the tokens package zeroes out
 * under that query.
 */
export function Sidebar({
  items,
  className,
}: {
  items: NavItem[];
  className?: string;
}): ReactElement {
  const t = useTranslations();
  const tShell = useTranslations("app.shell");
  const pathname = usePathname();

  const [storedGroups, setStoredGroups] = useState<Record<string, boolean>>({});
  const [rail, setRail] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [overflow, setOverflow] = useState({ above: false, below: false });
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restoring stored preferences; see the note above. */
    setStoredGroups(readCollapsedGroups());
    setRail(readRail());
    const frame = requestAnimationFrame(() => {
      setAnimate(true);
    });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--shell-sidebar-width",
      rail ? WIDTH_RAIL : WIDTH_EXPANDED,
    );
    return () => {
      document.documentElement.style.removeProperty("--shell-sidebar-width");
    };
  }, [rail]);

  const mainItems = items.filter(
    (item) => !item.sidebarPlacement || item.sidebarPlacement === "main",
  );
  const ungrouped = mainItems.filter((item) => !item.group);
  const footerGroups = new Map<string, NavItem[]>();
  for (const item of items) {
    if (item.sidebarPlacement !== "footer" || !item.group) continue;
    footerGroups.set(item.group, [...(footerGroups.get(item.group) ?? []), item]);
  }
  const groups = new Map<string, NavItem[]>();
  for (const item of mainItems) {
    if (!item.group) continue;
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  const orderedGroups = [...groups.entries()].sort(
    ([a], [b]) => navGroupOrder.indexOf(a) - navGroupOrder.indexOf(b),
  );

  // Open the active group by default, preserving the reader's saved choice.
  // Only the best match is active, across every group: on /library/copies
  // the library dashboard ("/library") is an ancestor, not the current page.
  const activeHref = activeNavHref(pathname, items);
  const activeGroup = items.find((item) => item.group && item.href === activeHref)?.group;

  function isOpen(group: string): boolean {
    // A rail has no room for a group header, so its items always show:
    // collapsed groups there would hide destinations behind nothing.
    if (rail) return true;
    return !(storedGroups[group] ?? group !== activeGroup);
  }

  // A list this long scrolls without saying so. The fades appear only on the
  // edge that actually has more behind it, so a list that fits stays clean.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    // The ResizeObserver fires on every child during the grid-rows animation
    // (each frame changes the group's measured height), and the scroll
    // listener can fire just as often. Coalescing every trigger into a
    // single rAF-scheduled read caps the work at one measurement per frame
    // instead of a layout read per event.
    let frame: number | null = null;
    function measure() {
      frame = null;
      if (!el) return;
      const above = el.scrollTop > SCROLL_EPSILON;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - SCROLL_EPSILON;
      // Skip the setState entirely when neither boolean moved, so a storm of
      // observer callbacks with no visible change never triggers a re-render.
      setOverflow((prev) =>
        prev.above === above && prev.below === below ? prev : { above, below },
      );
    }
    function scheduleMeasure() {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    }
    scheduleMeasure();
    el.addEventListener("scroll", scheduleMeasure, { passive: true });
    // Opening a group or switching to the rail changes the scroll height
    // without a scroll event, and the transition means the final height
    // arrives a few frames late.
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", scheduleMeasure);
      observer.disconnect();
    };
  }, [rail, storedGroups, items]);

  function toggleGroup(group: string) {
    setStoredGroups((prev) => {
      const next = { ...prev, [group]: isOpen(group) };
      persist(GROUPS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function toggleRail() {
    setRail((prev) => {
      persist(RAIL_STORAGE_KEY, prev ? "0" : "1");
      return !prev;
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      {/*
        `self-start` matters: a flex child stretches to the container's full
        height by default, and an element as tall as its container never
        sticks. Pinned to the viewport with its own height, the nav below
        scrolls on its own while the page scrolls behind it.
      */}
      <aside
        style={{ width: rail ? WIDTH_RAIL : WIDTH_EXPANDED }}
        className={cn(
          "sticky top-0 h-dvh shrink-0 flex-col self-start overflow-hidden border-r border-border bg-surface",
          // The width transition below reflows layout on every frame; contain
          // it to this subtree so the toggle does not re-layout the rest of
          // the page. Both flyout (GroupFlyout) and tooltip content render
          // through a Radix Portal to document.body, outside this subtree,
          // so containment here cannot clip them.
          "[contain:layout_paint]",
          animate &&
            "transition-[width] duration-[calc(var(--duration-base)*1.2)] ease-[var(--ease-standard)]",
          className,
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <TenantBrand mark={rail} />
        </div>

        <div className="relative min-h-0 flex-1">
          <nav
            ref={navRef}
            className="flex h-full flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-2"
            aria-label={tShell("sidebar.label")}
          >
            {ungrouped.map((item) => (
              <NavLink
                key={item.key}
                item={item}
                rail={rail}
                animate={animate}
                delayMs={0}
                nested={false}
                activeHref={activeHref}
              />
            ))}

            {rail
              ? orderedGroups.map(([group, groupItems]) => (
                  <GroupFlyout
                    key={group}
                    group={group}
                    items={groupItems}
                    animate={animate}
                    activeHref={activeHref}
                  />
                ))
              : orderedGroups.map(([group, groupItems]) => {
                  const open = isOpen(group);
                  return (
                    <div key={group} className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          toggleGroup(group);
                        }}
                        aria-expanded={open}
                        className={cn(
                          "mt-2 flex h-8 shrink-0 items-center justify-between rounded-sm px-3 text-[12px] font-medium text-fg-muted hover:text-fg",
                          animate &&
                            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                        )}
                      >
                        <span className="truncate">{t(group)}</span>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0",
                            animate &&
                              "transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)]",
                            !open && "-rotate-90",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                      {/*
                        Rows are kept mounted and the wrapper's track is animated
                        from 0fr to 1fr: height alone cannot transition to `auto`,
                        and measuring the list in JS would fight the font loading.
                      */}
                      <div
                        className={cn(
                          "grid",
                          animate &&
                            "transition-[grid-template-rows] duration-[var(--duration-base)] ease-[var(--ease-standard)]",
                          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="overflow-hidden [contain:layout_paint]">
                          {/*
                            The guide rule is what makes these rows read as the
                            group's children rather than its siblings.
                          */}
                          <div className="ml-5 flex flex-col gap-0.5 border-l border-border pl-2">
                            {groupItems.map((item, index) => (
                              <NavLink
                                key={item.key}
                                item={item}
                                rail={false}
                                animate={animate}
                                delayMs={open ? index * 25 : 0}
                                nested
                                activeHref={activeHref}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
          </nav>

          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-surface to-transparent",
              animate &&
                "transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
              overflow.above ? "opacity-100" : "opacity-0",
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent",
              animate &&
                "transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
              overflow.below ? "opacity-100" : "opacity-0",
            )}
          />
        </div>

        <div className="flex shrink-0 flex-col gap-0.5 border-t border-border p-2">
          {[...footerGroups.entries()].map(([group, groupItems]) => (
            <GroupFlyout
              key={group}
              group={group}
              items={groupItems}
              animate={animate}
              activeHref={activeHref}
              rail={rail}
            />
          ))}
          <RailLabel label={tShell("sidebar.expand")} enabled={rail}>
            <button
              type="button"
              onClick={toggleRail}
              aria-label={rail ? tShell("sidebar.expand") : tShell("sidebar.collapse")}
              aria-expanded={!rail}
              className={cn(
                "flex h-9 w-full items-center gap-3 rounded-sm px-3 text-[13px] text-fg-muted",
                "hover:bg-accent/8 hover:text-fg active:bg-accent/15",
                animate &&
                  "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
              )}
            >
              {rail ? (
                <PanelLeftOpen className="size-5 shrink-0" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-5 shrink-0" aria-hidden="true" />
              )}
              <span
                className={cn(
                  "truncate",
                  animate &&
                    "transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-standard)]",
                  rail ? "-translate-x-1 opacity-0" : "translate-x-0 opacity-100",
                )}
              >
                {tShell("sidebar.collapse")}
              </span>
            </button>
          </RailLabel>
        </div>
      </aside>
    </TooltipProvider>
  );
}
