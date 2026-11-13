"use client";

import { createContext, useContext, useMemo, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

export type StatAppearance = "plain" | "tile" | "compact";
export type StatGridVariant = "grid" | "tiles" | "strip";

interface StatGridContextValue {
  /** Inside a StatGrid each Stat is a `dt`/`dd` group of its `dl`. */
  inList: boolean;
  appearance: StatAppearance | null;
}

const StatGridContext = createContext<StatGridContextValue>({ inList: false, appearance: null });

export function useStatGrid(): StatGridContextValue {
  return useContext(StatGridContext);
}

const APPEARANCE: Record<StatGridVariant, StatAppearance | null> = {
  grid: null,
  tiles: "tile",
  strip: "compact",
};

export interface StatGridProps extends ComponentPropsWithoutRef<"dl"> {
  /**
   * `grid` (default) lays out plain stats; `tiles` turns each into a card
   * tile; `strip` is one low row of compact figures on a single surface,
   * scrolling sideways on a phone, for work screens where a row of tiles
   * would push the task below the fold.
   */
  variant?: StatGridVariant;
}

/** A definition list of stats; override the column count through `className`. */
export function StatGrid({ className, variant = "grid", ...props }: StatGridProps) {
  const context = useMemo(() => ({ inList: true, appearance: APPEARANCE[variant] }), [variant]);
  if (variant === "strip") {
    return (
      <StatGridContext.Provider value={context}>
        {/* The scroller takes focus so a keyboard can reach figures past the edge (axe: scrollable-region-focusable). */}
        <div
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll container must be focusable to scroll by keyboard
          tabIndex={0}
          className="scrollbar-none overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-surface shadow-1 focus-visible:outline-offset-2"
        >
          {/* As wide as its figures and never narrower than the surface: they share the row when they fit and scroll when they do not. */}
          <dl className={cn("flex w-max min-w-full divide-x divide-line", className)} {...props} />
        </div>
      </StatGridContext.Provider>
    );
  }
  return (
    <StatGridContext.Provider value={context}>
      <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)} {...props} />
    </StatGridContext.Provider>
  );
}
