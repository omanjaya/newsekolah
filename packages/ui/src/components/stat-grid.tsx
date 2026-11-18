"use client";

import {
  Children,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type RefObject,
} from "react";

import { useScrollEdges } from "../hooks/use-scroll-edges.js";
import { cn } from "../utils/cn.js";

export type StatAppearance = "plain" | "tile" | "compact";
export type StatGridVariant = "grid" | "tiles" | "strip";

interface StatGridContextValue {
  /** Inside a StatGrid each Stat is a `dt`/`dd` group of its `dl`. */
  inList: boolean;
  appearance: StatAppearance | null;
  /**
   * A strip of four figures or fewer: below `sm` its cells sit two to a
   * row instead of scrolling, so a cell lets its label wrap there.
   */
  pairsOnPhone: boolean;
}

const StatGridContext = createContext<StatGridContextValue>({
  inList: false,
  appearance: null,
  pairsOnPhone: false,
});

export function useStatGrid(): StatGridContextValue {
  return useContext(StatGridContext);
}

const APPEARANCE: Record<StatGridVariant, StatAppearance | null> = {
  grid: null,
  tiles: "tile",
  strip: "compact",
};

/** The most figures a strip shows two to a row on a phone; a longer strip scrolls sideways. */
const MAX_PAIRED_FIGURES = 4;

export interface StatGridProps extends ComponentPropsWithRef<"dl"> {
  /**
   * `grid` (default) lays out plain stats; `tiles` turns each into a card
   * tile; `strip` is one low row of compact figures on a single surface,
   * for work screens where a row of tiles would push the task below the
   * fold. On a phone a strip of four figures or fewer sits two to a row,
   * and a longer one scrolls sideways behind an edge fade. A strip's
   * `aria-label` or `aria-labelledby` names its group.
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

// One row of figures: as wide as its figures and never narrower than the
// surface, so they share the row when they fit and scroll when they do not.
const ROW_CLASS = "flex w-max min-w-full divide-x divide-line";

// Below `sm`, a strip of up to four figures is a two-column grid drawn
// with hairlines: a rule left of every second cell and above every cell
// past the first row, the last cell spanning the row when the count is
// odd. From `sm` up it is the same single row as a longer strip.
const PAIRED_CLASS = [
  "grid grid-cols-2 sm:flex sm:w-max sm:min-w-full sm:divide-x sm:divide-line",
  "max-sm:[&>*]:border-line max-sm:[&>*:nth-child(even)]:border-l max-sm:[&>*:nth-child(n+3)]:border-t",
  "max-sm:[&>*:last-child:nth-child(odd)]:col-span-2",
].join(" ");

function StatStrip({
  className,
  paired,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  ...props
}: Omit<StatGridProps, "variant"> & { paired: boolean }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const overflows = useOverflowsX(scrollerRef);
  useScrollEdges(scrollerRef, { axis: "x" });
  return (
    // The surface is a box of its own, so the edge fade and the scroll
    // never touch its border and corners. It draws the scroller's focus
    // ring, which the fade would otherwise mask away.
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-1 has-[[data-stat-scroller]:focus-visible]:outline-2 has-[[data-stat-scroller]:focus-visible]:outline-offset-2 has-[[data-stat-scroller]:focus-visible]:outline-focus-ring">
      {/* A named group around the figures. It takes focus only while
          figures sit past its edge, so a keyboard can scroll to them (axe:
          scrollable-region-focusable) without a dead tab stop when all fit. */}
      <div
        ref={scrollerRef}
        role="group"
        aria-label={label}
        aria-labelledby={labelledBy}
        data-stat-scroller=""
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll container must be focusable to scroll by keyboard
        tabIndex={overflows ? 0 : undefined}
        className="scrollbar-none snap-x snap-proximity overflow-x-auto overscroll-x-contain scroll-fade-x focus-visible:outline-none"
      >
        <dl className={cn(paired ? PAIRED_CLASS : ROW_CLASS, className)} {...props} />
      </div>
    </div>
  );
}

/** A definition list of stats; override the column count through `className`. */
export function StatGrid({ className, variant = "grid", children, ...props }: StatGridProps) {
  const paired = variant === "strip" && Children.toArray(children).length <= MAX_PAIRED_FIGURES;
  const context = useMemo(
    () => ({ inList: true, appearance: APPEARANCE[variant], pairsOnPhone: paired }),
    [variant, paired],
  );
  return (
    <StatGridContext.Provider value={context}>
      {variant === "strip" ? (
        <StatStrip className={className} paired={paired} {...props}>
          {children}
        </StatStrip>
      ) : (
        <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)} {...props}>
          {children}
        </dl>
      )}
    </StatGridContext.Provider>
  );
}
