"use client";

import { useEffect, useLayoutEffect, useRef, type DependencyList, type RefObject } from "react";

/** Attribute the one row the marker sits beside carries; its value picks the horizontal offset. */
export const NAV_MARKER_ATTR = "data-nav-marker";

/** How long after a change the marker keeps following layout (a group's 200ms collapse, the rail's 200ms width). */
const FOLLOW_MS = 260;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Places the sidebar's single active marker beside whichever row inside
 * `containerRef` carries `data-nav-marker`, through CSS variables the
 * marker reads (`--nav-marker-x`, `--nav-marker-y`). When the target row
 * changes (a new page, a group folding over the active page) the marker
 * glides there with `motion-indicator`; when the same row merely moves (a
 * group above it opening, fonts loading) it follows at once, so it never
 * trails the row through a collapse. Positions come from rendered boxes,
 * so a row may sit at any depth inside the container.
 *
 * `offsets` maps the attribute's value to a left offset: top-level rows
 * put the marker in the gutter, nested rows on their group's guide rule.
 */
export function useNavMarker(
  containerRef: RefObject<HTMLElement | null>,
  markerRef: RefObject<HTMLElement | null>,
  offsets: Readonly<Record<string, number>>,
  deps: DependencyList,
): void {
  const last = useRef<{ target: Element | null; y: number }>({ target: null, y: 0 });

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const marker = markerRef.current;
    if (!container || !marker) return;

    const place = () => {
      const target = container.querySelector<HTMLElement>(`[${NAV_MARKER_ATTR}]`);
      const box = target?.getBoundingClientRect();
      if (!target || !box || box.height === 0) {
        marker.removeAttribute("data-visible");
        last.current = { target: null, y: 0 };
        return;
      }
      const origin = container.getBoundingClientRect();
      const y = Math.round(box.top - origin.top + (box.height - marker.offsetHeight) / 2);
      const moved = last.current.target !== target;
      if (!moved && last.current.y === y) return;
      // A new target travels; the same target that moved follows at once,
      // and the first placement appears in place rather than flying in.
      const travel = moved && last.current.target !== null;
      if (!travel) marker.setAttribute("data-instant", "");
      const left = offsets[target.getAttribute(NAV_MARKER_ATTR) ?? ""] ?? 0;
      marker.style.setProperty("--nav-marker-x", `${String(left)}px`);
      marker.style.setProperty("--nav-marker-y", `${String(y)}px`);
      marker.setAttribute("data-visible", "");
      if (!travel) {
        // Flush the jump before the transition comes back on.
        marker.getBoundingClientRect();
        marker.removeAttribute("data-instant");
      }
      last.current = { target, y };
    };

    place();
    const start = performance.now();
    let frame = requestAnimationFrame(function follow(now) {
      place();
      if (now - start < FOLLOW_MS) frame = requestAnimationFrame(follow);
    });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            place();
          });
    observer?.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, deps);
}
