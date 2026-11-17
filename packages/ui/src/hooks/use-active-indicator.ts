"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

import { createResizeTracker } from "./resize-tracker.js";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room left beside an item revealed in a scrolled strip: the width of the edge fade. */
const REVEAL_MARGIN = 24;

/**
 * How long a strip's last indicator box is worth travelling from: long
 * enough to span a route change between sibling pages (the old page's
 * strip unmounts, the new page's mounts), short enough that a strip met
 * again later just appears in place.
 */
const HANDOFF_MS = 2000;

/**
 * The last box of each named strip that went away, so the same strip on
 * the next page (an area's tabs, rebuilt by every page under it) slides
 * from the old tab instead of appearing under the new one.
 */
const handoffs = new Map<string, { box: Box; at: number }>();

/**
 * A strip's identity across pages: its accessible name (on the strip or
 * its track) and its items' text. Unnamed strips are not remembered.
 */
function stripKey(container: HTMLElement): string | null {
  const label =
    container.getAttribute("aria-label") ?? container.parentElement?.getAttribute("aria-label");
  return label ? `${label}\n${container.textContent}` : null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Placed before the first paint, so a strip never shows its item's own fill and then jumps. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function boxOf(element: HTMLElement): Box {
  return {
    x: element.offsetLeft,
    y: element.offsetTop,
    w: element.offsetWidth,
    h: element.offsetHeight,
  };
}

function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function writeBox(indicator: HTMLElement, size: Box, at: Box, scale: number) {
  indicator.style.setProperty("--indicator-w", `${size.w}px`);
  indicator.style.setProperty("--indicator-h", `${size.h}px`);
  indicator.style.setProperty("--indicator-x", `${at.x}px`);
  indicator.style.setProperty("--indicator-y", `${at.y}px`);
  indicator.style.setProperty("--indicator-scale", String(scale));
}

/**
 * Scrolls a sideways strip just enough to show `item` clear of the edge
 * fade, without moving the page (no scrollIntoView). Measured from the
 * rendered boxes, so the item may sit at any depth inside the strip.
 * Shared by every strip: Tabs and NavTabs through useActiveIndicator,
 * SegmentedControl directly.
 */
export function revealInStrip(container: HTMLElement, item: HTMLElement): void {
  if (container.scrollWidth <= container.clientWidth) return;
  const start =
    item.getBoundingClientRect().left -
    container.getBoundingClientRect().left +
    container.scrollLeft;
  const left = start - REVEAL_MARGIN;
  const right = start + item.offsetWidth + REVEAL_MARGIN;
  if (left < container.scrollLeft) container.scrollLeft = Math.max(left, 0);
  else if (right > container.scrollLeft + container.clientWidth) {
    container.scrollLeft = right - container.clientWidth;
  }
}

/**
 * Slides one shared indicator (a tab pill, an underline) to whichever item
 * inside `containerRef` matches `activeSelector`, moving it with transform
 * only, as the motion rules require: the indicator takes the new item's
 * size at once and starts from the old item's position at a compensating
 * horizontal scale, then `motion-indicator` eases translate and scale back
 * to 1 (FLIP). Reduced motion strips transform from transitions, so it
 * simply jumps there.
 *
 * Positions are written as CSS variables (`--indicator-x`, `-y`, `-w`,
 * `-h`, `--indicator-scale`) on the indicator, which reads them through
 * its classes. The container is the indicator's positioned ancestor and,
 * when it scrolls, gets the newly active item scrolled into view. It is
 * marked `data-indicator="ready"` once the indicator is placed, so items
 * can stop painting their own active fill (they do until then: the server
 * render and a no-JS page still show which item is active).
 *
 * A named strip that mounts again within moments of going away (the same
 * area tabs on a sibling route) starts from the box it last had, so the
 * indicator travels between pages as it does within one.
 */
export function useActiveIndicator(
  containerRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  activeSelector: string,
): void {
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    let previous: { element: HTMLElement; box: Box } | null = null;
    let disposed = false;
    // Read when the strip is first placed and on every placement after,
    // while it is still in the document: the cleanup runs after removal.
    let key: string | null = null;
    // Declared before `place`, which keeps it pointed at the active item.
    const sizes = createResizeTracker(() => {
      place();
    });

    const settle = () => {
      // Reading layout flushes the start position before the transition is
      // switched back on, so the browser animates from there.
      indicator.getBoundingClientRect();
      indicator.removeAttribute("data-instant");
    };

    const place = () => {
      if (disposed) return;
      const active = container.querySelector<HTMLElement>(activeSelector);
      // The strip's box often stays put while an item's width changes (an
      // underline or full-width strip, one capped at the container): watch
      // the active item, and the strip's own children, whose widths move it.
      const children = Array.from(container.children).filter((child) => child !== indicator);
      sizes.track([container, ...children, ...(active ? [active] : [])]);
      const box = active ? boxOf(active) : null;
      if (!active || !box || box.w === 0) {
        container.removeAttribute("data-indicator");
        previous = null;
        return;
      }
      if (previous?.element === active && sameBox(previous.box, box)) return;

      key = stripKey(container);
      // The same strip on the page just left: travel from where it was.
      const handoff = previous === null && key !== null ? handoffs.get(key) : undefined;
      if (key !== null) handoffs.delete(key);
      const from =
        previous !== null && previous.element !== active
          ? previous.box
          : handoff &&
              performance.now() - handoff.at < HANDOFF_MS &&
              !sameBox(handoff.box, box) &&
              !prefersReducedMotion()
            ? handoff.box
            : null;
      indicator.setAttribute("data-instant", "");
      if (from && from.w > 0) {
        writeBox(indicator, box, from, from.w / box.w);
        container.setAttribute("data-indicator", "ready");
        settle();
        writeBox(indicator, box, box, 1);
      } else {
        // First placement, or the same item changed size (fonts loaded,
        // the strip resized): no travel to show.
        writeBox(indicator, box, box, 1);
        container.setAttribute("data-indicator", "ready");
        settle();
      }
      if (previous?.element !== active) revealInStrip(container, active);
      previous = { element: active, box };
    };

    place();
    const mutationObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(place);
    // Text changes too: a count going from 9 to 12 widens its tab.
    mutationObserver?.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-current", "aria-selected", "hidden", "class"],
    });
    // A web font arriving late changes every label's width at once, often
    // without any element the observers watch changing size first.
    // (jsdom has no FontFaceSet.)
    if ("fonts" in document) void document.fonts.ready.then(place);

    return () => {
      disposed = true;
      mutationObserver?.disconnect();
      sizes.disconnect();
      container.removeAttribute("data-indicator");
      if (key !== null && previous !== null) {
        handoffs.set(key, { box: previous.box, at: performance.now() });
      }
    };
  }, [containerRef, indicatorRef, activeSelector]);
}
