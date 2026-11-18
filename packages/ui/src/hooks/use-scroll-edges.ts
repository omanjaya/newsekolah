"use client";

import { useEffect, type RefObject } from "react";

import { createResizeTracker } from "./resize-tracker.js";

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

    // The scroller and its children: a child growing (a collapsible
    // opening, a textarea growing with its text) changes the scroll size
    // without resizing the box. jsdom has no ResizeObserver; the scroll
    // listener and the first measurement still work there.
    const sizes = createResizeTracker(update);
    const trackChildren = () => {
      sizes.track([scroller, ...Array.from(scroller.children)]);
    };

    update();
    trackChildren();
    scroller.addEventListener("scroll", update, { passive: true });
    // Content that mounts later (a form replacing its skeleton, a tab added
    // after a permission check) changes the scroll size too, and is then
    // watched for size changes of its own.
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            trackChildren();
            update();
          });
    mutationObserver?.observe(scroller, { childList: true, subtree: true });

    return () => {
      scroller.removeEventListener("scroll", update);
      sizes.disconnect();
      mutationObserver?.disconnect();
      marked.removeAttribute("data-overflow-start");
      marked.removeAttribute("data-overflow-end");
    };
  }, [scrollerRef, axis, markParent]);
}
