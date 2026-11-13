"use client";

import { useEffect, type RefObject } from "react";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room left beside an item revealed in a scrolled strip: the width of the edge fade. */
const REVEAL_MARGIN = 24;

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

/** Scrolls a strip just enough to show the item, without moving the page. */
function reveal(container: HTMLElement, item: HTMLElement) {
  if (container.scrollWidth <= container.clientWidth) return;
  const left = item.offsetLeft - REVEAL_MARGIN;
  const right = item.offsetLeft + item.offsetWidth + REVEAL_MARGIN;
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
 */
export function useActiveIndicator(
  containerRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  activeSelector: string,
): void {
  useEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    let previous: { element: HTMLElement; box: Box } | null = null;

    const settle = () => {
      // Reading layout flushes the start position before the transition is
      // switched back on, so the browser animates from there.
      indicator.getBoundingClientRect();
      indicator.removeAttribute("data-instant");
    };

    const place = () => {
      const active = container.querySelector<HTMLElement>(activeSelector);
      const box = active ? boxOf(active) : null;
      if (!active || !box || box.w === 0) {
        container.removeAttribute("data-indicator");
        previous = null;
        return;
      }
      if (previous?.element === active && sameBox(previous.box, box)) return;

      const moved = previous !== null && previous.element !== active && previous.box.w > 0;
      indicator.setAttribute("data-instant", "");
      if (moved && previous) {
        writeBox(indicator, box, previous.box, previous.box.w / box.w);
        settle();
        writeBox(indicator, box, box, 1);
      } else {
        // First placement, or the same item changed size (fonts loaded,
        // the strip resized): no travel to show.
        writeBox(indicator, box, box, 1);
        container.setAttribute("data-indicator", "ready");
        settle();
      }
      if (previous?.element !== active) reveal(container, active);
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
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    resizeObserver?.observe(container);

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      container.removeAttribute("data-indicator");
    };
  }, [containerRef, indicatorRef, activeSelector]);
}
