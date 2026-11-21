"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

import { createResizeTracker } from "./resize-tracker.js";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Room left beside an item revealed in a scrolled strip: the longest edge
 * fade (an underline strip's 48px, a 20px clear band under its chevron
 * included), so the active item always lands fully opaque, clear of the
 * band and the chevron.
 */
const REVEAL_MARGIN = 48;

/**
 * How long a strip's last indicator box is worth travelling from: long
 * enough to span a route change between sibling pages (the old page's
 * strip unmounts, the new page's mounts), short enough that a strip met
 * again later just appears in place.
 */
const HANDOFF_MS = 2000;

/**
 * How soon after a wheel, touch, pointer or key on a strip a scroll of it
 * counts as the reader's own: a swipe's first scroll events land well
 * inside it, and every wheel step starts it again.
 */
const GESTURE_MS = 1000;

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

/** Where the indicator was last placed, and the strip's overflow then. */
interface Placement {
  element: HTMLElement;
  box: Box;
  scrollWidth: number;
  clientWidth: number;
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
 * How much of the first item cut by a strip's edge must show, so it reads
 * as "more this way" past the edge fade (40px on a pill strip, 48px on an
 * underline strip) instead of a ghost of one letter.
 * The item's box includes its own padding (12px), so 56 puts the start of
 * its label at the inner edge of the widest fade; 40 left the label inside
 * it, a faint ghost.
 */
const PEEK = 56;

interface Span {
  start: number;
  end: number;
}

/**
 * The strip's items around `item`, from the first ancestor of it (itself
 * included) that has siblings: a tab, or the `li` holding a nav link. The
 * indicator (aria-hidden) is not an item.
 */
function stripItems(
  container: HTMLElement,
  item: HTMLElement,
): { own: HTMLElement; all: HTMLElement[] } {
  let own = item;
  while (own.parentElement && own.parentElement !== container) {
    const siblings = Array.from(own.parentElement.children).filter(
      (child) => child.getAttribute("aria-hidden") !== "true",
    );
    if (siblings.length > 1) break;
    own = own.parentElement;
  }
  const parent = own.parentElement ?? container;
  const all = Array.from(parent.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.getAttribute("aria-hidden") !== "true",
  );
  return { own, all };
}

/**
 * Nudges a scrolled strip so the first item cut by its end (or, failing
 * that, its start) shows at least `PEEK` of itself, as long as the active
 * item stays wholly in view: a strip whose next tab began a few pixels
 * before the edge, inside the fade, looked complete.
 */
function peekPastEdges(container: HTMLElement, item: HTMLElement): void {
  const { own, all } = stripItems(container, item);
  if (all.length < 2) return;
  const origin = container.getBoundingClientRect().left - container.scrollLeft;
  const span = (element: HTMLElement): Span => {
    const rect = element.getBoundingClientRect();
    return { start: rect.left - origin, end: rect.right - origin };
  };
  const view: Span = {
    start: container.scrollLeft,
    end: container.scrollLeft + container.clientWidth,
  };
  const active = span(own);
  const spans = all.map(span);
  const maxScroll = container.scrollWidth - container.clientWidth;

  // The first item past or across the end, the last one past or across
  // the start, and how much of each shows.
  const cutEnd = spans.find((box) => box.end > view.end + 1);
  const cutStart = [...spans].reverse().find((box) => box.start < view.start - 1);
  const endNeed = cutEnd ? PEEK - Math.max(0, view.end - cutEnd.start) : 0;
  const startNeed = cutStart ? PEEK - Math.max(0, cutStart.end - view.start) : 0;

  // The active item keeps clear of the fade on the side it moves towards;
  // a strip with no room for that stays where the reveal left it.
  let delta = 0;
  if (endNeed > 0) {
    delta = Math.max(
      0,
      Math.min(endNeed, active.start - view.start - REVEAL_MARGIN, maxScroll - view.start),
    );
  } else if (startNeed > 0) {
    delta = -Math.max(0, Math.min(startNeed, view.end - active.end - REVEAL_MARGIN, view.start));
  }
  if (Math.abs(delta) >= 1) container.scrollLeft = view.start + delta;
}

/**
 * Scrolls a sideways strip just enough to show `item` clear of the edge
 * fade, without moving the page (no scrollIntoView), then lets the
 * neighbour cut by an edge peek in past the fade. Measured from the
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
  peekPastEdges(container, item);
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
 * when it scrolls, gets the active item scrolled into view: when it
 * becomes active, and again whenever its box or the strip's overflow
 * changes (counts arriving widen every segment and can push it past the
 * edge), unless the reader has scrolled the strip by hand since. It is
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

    let previous: Placement | null = null;
    let disposed = false;
    // Whether the reader has scrolled the strip themselves since the active
    // item last changed: a later resize then leaves the strip where they
    // put it instead of pulling it back to the active item.
    let scrolledByHand = false;
    // A scroll moments after a gesture on the strip (wheel, touch, pointer,
    // key), to anywhere but where the hook last left it, is the reader's
    // own. The browser clamping a strip that got narrower, or focus
    // scrolling an item into view from outside, comes with no such gesture.
    let lastGesture = Number.NEGATIVE_INFINITY;
    let settledScroll = container.scrollLeft;
    const onGesture = () => {
      lastGesture = performance.now();
    };
    const onScroll = () => {
      const byHand = performance.now() - lastGesture < GESTURE_MS;
      if (byHand && Math.abs(container.scrollLeft - settledScroll) >= 1) scrolledByHand = true;
      settledScroll = container.scrollLeft;
    };
    const gestures = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const type of gestures) {
      container.addEventListener(type, onGesture, { passive: true });
    }
    container.addEventListener("scroll", onScroll, { passive: true });

    const reveal = (active: HTMLElement) => {
      revealInStrip(container, active);
      settledScroll = container.scrollLeft;
    };
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
      const overflow = { scrollWidth: container.scrollWidth, clientWidth: container.clientWidth };
      const changedItem = previous?.element !== active;
      const moved = changedItem || !previous || !sameBox(previous.box, box);
      const reflowed =
        previous?.scrollWidth !== overflow.scrollWidth ||
        previous.clientWidth !== overflow.clientWidth;
      if (!moved && !reflowed) return;
      if (changedItem) scrolledByHand = false;
      // The indicator already sits on this box: only the strip moved.
      if (!moved) {
        if (!scrolledByHand) reveal(active);
        previous = { element: active, box, ...overflow };
        return;
      }

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
      // A newly active item is always shown; the same item again when its
      // box or the strip's overflow changed, unless the reader scrolled
      // the strip away from it by hand.
      if (!scrolledByHand) reveal(active);
      previous = { element: active, box, ...overflow };
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
      for (const type of gestures) container.removeEventListener(type, onGesture);
      container.removeEventListener("scroll", onScroll);
      mutationObserver?.disconnect();
      sizes.disconnect();
      container.removeAttribute("data-indicator");
      if (key !== null && previous !== null) {
        handoffs.set(key, { box: previous.box, at: performance.now() });
      }
    };
  }, [containerRef, indicatorRef, activeSelector]);
}
