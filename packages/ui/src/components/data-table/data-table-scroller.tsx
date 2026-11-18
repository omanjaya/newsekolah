"use client";

import { useRef, type ReactElement, type ReactNode } from "react";

import { useScrollEdges } from "../../hooks/use-scroll-edges.js";
import { cn } from "../../utils/cn.js";

/**
 * The desktop table's box: it scrolls sideways when the columns are wider
 * than the card, and, with `fillHeight`, up and down under the sticky
 * head. Then its edges fade while rows wait past them (`scroll-fade-y`,
 * starting below the 40px head), so the row the footer cuts reads as
 * "more below". Its own component, so the edges are measured whenever it
 * mounts again after an empty or error state.
 */
export function DataTableScroller({
  fillHeight,
  children,
}: {
  fillHeight?: boolean;
  children: ReactNode;
}): ReactElement {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const unmeasured = useRef<HTMLDivElement>(null);
  useScrollEdges(fillHeight ? scrollerRef : unmeasured, { axis: "y" });
  return (
    <div
      ref={scrollerRef}
      className={cn(
        "hidden overflow-x-auto md:block",
        fillHeight &&
          "scroll-fade-y [--scroll-fade-inset-start:var(--space-10)] md:min-h-0 md:overflow-y-auto",
      )}
    >
      {children}
    </div>
  );
}
