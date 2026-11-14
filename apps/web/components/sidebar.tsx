"use client";

import { TooltipProvider, cn } from "@newsekolah/ui";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { splitSidebarGroups } from "../lib/group-navigation";
import type { NavItem } from "../lib/navigation";
import { activeNavHref } from "../lib/navigation/active-href";

import {
  GroupFlyout,
  NAV_MARKER_OFFSETS,
  NavGroup,
  NavRow,
  RailLabel,
  RowLabel,
} from "./sidebar-nav";
import { TenantBrand } from "./tenant-brand";
import { useNavMarker } from "./use-nav-marker";

const GROUPS_STORAGE_KEY = "newsekolah-sidebar-collapsed-groups-v2";
const RAIL_STORAGE_KEY = "newsekolah-sidebar-rail";

/** Room for the longest sentence-case label; the rail is the 40px row plus the 12px gutters. */
const WIDTH_EXPANDED = "15rem";
const WIDTH_RAIL = "4rem";

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

/** The one marker per list; `useNavMarker` places it beside the active row. */
function Marker({ markerRef }: { markerRef: RefObject<HTMLSpanElement | null> }): ReactElement {
  return (
    <span
      ref={markerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-0 left-0 h-5 w-[3px] rounded-full bg-accent opacity-0",
        "[translate:var(--nav-marker-x,0px)_var(--nav-marker-y,0px)] motion-indicator",
        "data-[instant]:transition-none data-[visible]:opacity-100",
      )}
    />
  );
}

/**
 * Desktop sidebar (docs/17-penyederhanaan-menu.md): daily destinations
 * first (Beranda, Perlu tindakan, Pindai, Laporan), then one row per group,
 * as heavy as a link and carrying the group's icon, over its pages on a
 * guide rule. Two widths: the full list, or a rail of icons whose groups
 * open in flyouts. The rail choice and each group's open state persist to
 * localStorage.
 *
 * Stored preferences are applied in an effect rather than read during
 * render: the server has no localStorage, and reading it while rendering
 * would make the first client pass disagree with the server HTML.
 * `animate` stays false until that effect lands, so restoring a rail or a
 * closed group on load snaps into place instead of sliding unprompted.
 * Motion follows the spec's layout vocabulary: the width and a group's
 * rows animate over 200ms (`motion-layout`, `motion-collapse`), and the
 * active marker glides between rows (`motion-indicator`). Reduced motion
 * strips the travel through the token layer.
 */
export function Sidebar({
  items,
  className,
}: {
  items: NavItem[];
  className?: string;
}): ReactElement {
  const tShell = useTranslations("app.shell");
  const pathname = usePathname();

  const [storedGroups, setStoredGroups] = useState<Record<string, boolean>>({});
  const [rail, setRail] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [overflow, setOverflow] = useState({ above: false, below: false });
  const navRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const footerMarkerRef = useRef<HTMLSpanElement | null>(null);

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
  const { ungrouped, groups } = splitSidebarGroups(mainItems);
  const footerItems = items.filter((item) => item.sidebarPlacement === "footer");

  // Only the best match is active, across every group: on /library/copies
  // the library dashboard ("/library") is an ancestor, not the current page.
  const activeHref = activeNavHref(pathname, items);
  const activeGroup = items.find((item) => item.group && item.href === activeHref)?.group;

  function isOpen(group: string): boolean {
    // The active group opens by default; the reader's saved choice wins.
    return !(storedGroups[group] ?? group !== activeGroup);
  }

  const openKey = groups.map(([group]) => (isOpen(group) ? "1" : "0")).join("");
  useNavMarker(listRef, markerRef, NAV_MARKER_OFFSETS, [activeHref, rail, openKey, items]);
  useNavMarker(footerRef, footerMarkerRef, NAV_MARKER_OFFSETS, [activeHref, rail, items]);

  // A list this long scrolls without saying so. The fades appear only on the
  // edge that actually has more behind it, so a list that fits stays clean.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    // Coalesce scroll and resize triggers into one read per frame: the
    // ResizeObserver fires on every frame of a group's collapse.
    let frame: number | null = null;
    function measure() {
      frame = null;
      if (!el) return;
      const above = el.scrollTop > SCROLL_EPSILON;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - SCROLL_EPSILON;
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
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(el);
    if (listRef.current) observer.observe(listRef.current);
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

  const toggleLabel = rail ? tShell("sidebar.expand") : tShell("sidebar.collapse");

  return (
    <TooltipProvider delayDuration={300}>
      {/*
        `self-start` matters: a flex child stretches to the container's full
        height by default, and an element as tall as its container never
        sticks. Pinned to the viewport with its own height, the nav below
        scrolls on its own while the page scrolls behind it.
      */}
      <aside
        style={{ width: rail ? WIDTH_RAIL : WIDTH_EXPANDED }}
        data-rail={rail ? "" : undefined}
        className={cn(
          "sticky top-0 h-dvh shrink-0 flex-col self-start overflow-hidden border-r border-line bg-surface",
          // The width transition reflows layout every frame; contain it to
          // this subtree. Flyouts and tooltips portal to the body, so the
          // containment cannot clip them.
          "[contain:layout_paint]",
          animate && "motion-layout",
          className,
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
          <TenantBrand mark={rail} />
        </div>

        <div className="relative min-h-0 flex-1">
          <nav
            ref={navRef}
            aria-label={tShell("sidebar.label")}
            className="h-full overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            <div ref={listRef} className="relative flex flex-col gap-0.5 px-3 py-3">
              <Marker markerRef={markerRef} />
              {ungrouped.map((item) => (
                <NavRow
                  key={item.key}
                  item={item}
                  variant="top"
                  rail={rail}
                  activeHref={activeHref}
                />
              ))}
              {groups.length > 0 &&
                (rail ? (
                  <span aria-hidden="true" className="mx-auto my-2 h-px w-6 shrink-0 bg-line" />
                ) : (
                  <span aria-hidden="true" className="h-3 shrink-0" />
                ))}
              {groups.map(([group, groupItems]) =>
                rail ? (
                  <GroupFlyout
                    key={group}
                    group={group}
                    items={groupItems}
                    activeHref={activeHref}
                  />
                ) : (
                  <NavGroup
                    key={group}
                    group={group}
                    items={groupItems}
                    open={isOpen(group)}
                    animate={animate}
                    activeHref={activeHref}
                    onToggle={() => {
                      toggleGroup(group);
                    }}
                  />
                ),
              )}
            </div>
          </nav>

          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-surface to-transparent transition-opacity",
              overflow.above ? "opacity-100" : "opacity-0",
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent transition-opacity",
              overflow.below ? "opacity-100" : "opacity-0",
            )}
          />
        </div>

        <div
          ref={footerRef}
          className="relative flex shrink-0 flex-col gap-0.5 border-t border-line px-3 py-2"
        >
          <Marker markerRef={footerMarkerRef} />
          {footerItems.map((item) => (
            <NavRow key={item.key} item={item} variant="top" rail={rail} activeHref={activeHref} />
          ))}
          <RailLabel label={toggleLabel} enabled={rail}>
            <button
              type="button"
              onClick={toggleRail}
              aria-label={toggleLabel}
              aria-expanded={!rail}
              className="flex h-9 w-full shrink-0 items-center gap-3 rounded-md px-2.5 text-left text-body-sm font-medium text-fg-muted outline-none transition-colors hover:bg-state-hover hover:text-fg focus-visible:-outline-offset-2 active:bg-state-pressed"
            >
              {rail ? (
                <PanelLeftOpen className="size-5 shrink-0" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-5 shrink-0" aria-hidden="true" />
              )}
              <RowLabel rail={rail}>{tShell("sidebar.collapse")}</RowLabel>
            </button>
          </RailLabel>
        </div>
      </aside>
    </TooltipProvider>
  );
}
