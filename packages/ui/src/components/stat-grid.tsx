"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type RefObject,
} from "react";

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

export interface StatGridProps extends ComponentPropsWithRef<"dl"> {
  /**
   * `grid` (default) lays out plain stats; `tiles` turns each into a card
   * tile; `strip` is one low row of compact figures on a single surface,
   * scrolling sideways on a phone, for work screens where a row of tiles
   * would push the task below the fold. A strip's `aria-label` or
   * `aria-labelledby` names its scrolling group.
   */
  variant?: StatGridVariant;
}

/** Whether the element's content is wider than its box, kept current as either resizes. */
function useOverflowsX(ref: RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // A pixel of slack, so subpixel layout never counts as overflow.
    const update = () => {
      setOverflows(element.scrollWidth > element.clientWidth + 1);
    };
    update();
    // jsdom has no ResizeObserver; the first measurement still runs there.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const child of Array.from(element.children)) observer?.observe(child);
    return () => {
      observer?.disconnect();
    };
  }, [ref]);
  return overflows;
}

function StatStrip({
  className,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  ...props
}: Omit<StatGridProps, "variant">) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const overflows = useOverflowsX(scrollerRef);
  return (
    // A named group around the figures. It takes focus only while figures
    // sit past its edge, so a keyboard can scroll to them (axe:
    // scrollable-region-focusable) without a dead tab stop when all fit.
    <div
      ref={scrollerRef}
      role="group"
      aria-label={label}
      aria-labelledby={labelledBy}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll container must be focusable to scroll by keyboard
      tabIndex={overflows ? 0 : undefined}
      className="scrollbar-none overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-surface shadow-1 focus-visible:outline-offset-2"
    >
      {/* As wide as its figures and never narrower than the surface: they share the row when they fit and scroll when they do not. */}
      <dl className={cn("flex w-max min-w-full divide-x divide-line", className)} {...props} />
    </div>
  );
}

/** A definition list of stats; override the column count through `className`. */
export function StatGrid({ className, variant = "grid", ...props }: StatGridProps) {
  const context = useMemo(() => ({ inList: true, appearance: APPEARANCE[variant] }), [variant]);
  return (
    <StatGridContext.Provider value={context}>
      {variant === "strip" ? (
        <StatStrip className={className} {...props} />
      ) : (
        <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)} {...props} />
      )}
    </StatGridContext.Provider>
  );
}
