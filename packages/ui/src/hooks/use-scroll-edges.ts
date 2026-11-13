"use client";

import { useEffect, type RefObject } from "react";

/** A pixel of slack, so a fractional scroll position still counts as "at the edge". */
const EDGE_SLACK = 1;

export interface UseScrollEdgesOptions {
  axis: "x" | "y";
  /**
   * Put the attributes on the scroller's parent instead of the scroller, so
   * siblings can react too: a dialog marks its content element, and the
   * header and footer around the scrolling body draw their dividers from it.
   */
  markParent?: boolean;
}

/**
 * Marks a scroll container with `data-overflow-start` while content is
 * scrolled out past its start edge and `data-overflow-end` while more
 * content waits past its end edge. CSS draws the cue from there (edge
 * fades on a tab strip, dividers under a dialog header and above its
 * footer), so scrolling never re-renders React. Recomputes on scroll and
 * whenever the scroller or its content changes size.
 *
 * The ref must be filled when the calling component mounts: inside a
 * Radix portal, call this from a component rendered within the content.
 */
export function useScrollEdges(
  scrollerRef: RefObject<HTMLElement | null>,
  { axis, markParent = false }: UseScrollEdgesOptions,
): void {
  useEffect(() => {
    const scroller = scrollerRef.current;
    const marked = markParent ? scroller?.parentElement : scroller;
    if (!scroller || !marked) return;

    const update = () => {
      const position = axis === "x" ? scroller.scrollLeft : scroller.scrollTop;
      const visible = axis === "x" ? scroller.clientWidth : scroller.clientHeight;
      const total = axis === "x" ? scroller.scrollWidth : scroller.scrollHeight;
      // Right-to-left strips scroll into negative positions.
      const offset = Math.abs(position);
      marked.toggleAttribute("data-overflow-start", offset > EDGE_SLACK);
      marked.toggleAttribute("data-overflow-end", offset + visible < total - EDGE_SLACK);
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    // jsdom has no ResizeObserver; the scroll listener and the first
    // measurement still work there.
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resizeObserver?.observe(scroller);
    for (const child of Array.from(scroller.children)) resizeObserver?.observe(child);
    // Content that mounts later (a lazy form section, a tab added after a
    // permission check) changes the scroll size without resizing the box.
    const mutationObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(update);
    mutationObserver?.observe(scroller, { childList: true, subtree: true });

    return () => {
      scroller.removeEventListener("scroll", update);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      marked.removeAttribute("data-overflow-start");
      marked.removeAttribute("data-overflow-end");
    };
  }, [scrollerRef, axis, markParent]);
}
