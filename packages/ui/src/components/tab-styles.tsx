import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../utils/cn.js";

/**
 * The shared look of every "pick one of these" strip: Tabs, NavTabs and
 * SegmentedControl. One track, one sliding indicator, one item height per
 * size, one count chip, so a page cannot mix three tab styles any more.
 * Each component adds the selector for its own active state (Radix
 * `data-state`, `aria-current`), since that is the only part that differs.
 */
export type StripVariant = "pill" | "underline";
export type StripSize = "sm" | "md";

/**
 * The outer track. A pill strip is a sunken capsule as wide as its items;
 * an underline strip has no box, and its base line runs the full width of
 * the container, the way a page-level tab bar does. `fullWidth="phone"`
 * stretches a pill strip below 640px only, where it shares a toolbar's
 * column, and gives it back its own width from `sm` up.
 */
export function stripTrackClass(variant: StripVariant, fullWidth?: boolean | "phone"): string {
  return cn(
    // Positioned for the edge cues (StripEdgeCues), which sit over the
    // scroller's fades.
    "relative max-w-full min-w-0",
    fullWidth === true || variant === "underline"
      ? "flex w-full"
      : fullWidth === "phone"
        ? "flex w-full sm:inline-flex sm:w-fit"
        : "inline-flex w-fit",
    variant === "pill" && "overflow-hidden rounded-full bg-surface-sunken",
  );
}

/**
 * The scrolling row inside the track: never wider than its container, so
 * five or six tabs on a phone scroll sideways (with edge fades from
 * useScrollEdges) instead of widening the page. It is the indicator's
 * positioned ancestor. The pill's 4px padding sits inside the scroller so
 * focus rings and coarse-pointer hit areas are not clipped by it.
 *
 * Below 640px an underline strip runs out into the 16px page gutter on
 * both sides (its first tab stays where it was), so the next tab peeks in
 * from the screen's edge instead of ending flush with the column. A pill
 * strip keeps its capsule.
 *
 * A strip that renders StripEdgeCues (`edgeCues`) starts each faded edge
 * with a 20px clear band under its chevron, so the chevron never covers a
 * label: the text under it is fully masked out, whatever surface the strip
 * sits on. The fade then runs to 40px (pill) or 48px (underline), the same
 * on both edges. A strip without cues (SegmentedControl) keeps the plain
 * 24px fade, so none of its labels sit in an empty band.
 */
export function stripScrollerClass(
  variant: StripVariant,
  { edgeCues = false }: { edgeCues?: boolean } = {},
): string {
  return cn(
    "peer/strip relative flex min-w-0 flex-1 flex-nowrap overflow-x-auto overscroll-x-contain scrollbar-none scroll-fade-x",
    edgeCues && "[--scroll-fade-clear:var(--space-5)]",
    variant === "pill"
      ? cn(
          "p-1",
          edgeCues &&
            "[--scroll-fade-start-size:var(--space-10)] [--scroll-fade-end-size:var(--space-10)]",
        )
      : cn(
          "gap-1 shadow-[inset_0_-1px_0_var(--color-line)]",
          "max-sm:-mx-4 max-sm:scroll-px-4 max-sm:px-4",
          edgeCues &&
            "[--scroll-fade-start-size:var(--space-12)] [--scroll-fade-end-size:var(--space-12)]",
        ),
  );
}

/**
 * The indicator sliding under the active item (useActiveIndicator writes
 * the variables). A pill is a raised capsule, an underline a 2px accent
 * bar on the strip's own bottom line. Hidden until the hook has placed it.
 */
export function stripIndicatorClass(variant: StripVariant): string {
  return cn(
    "pointer-events-none absolute left-0 origin-left motion-indicator data-[instant]:transition-none",
    "w-(--indicator-w) translate-x-(--indicator-x) scale-x-(--indicator-scale)",
    "opacity-0 [[data-indicator=ready]>&]:opacity-100",
    variant === "pill"
      ? "top-0 h-(--indicator-h) translate-y-(--indicator-y) rounded-full bg-surface-raised shadow-1"
      : "bottom-0 h-0.5 rounded-full bg-accent",
  );
}

/**
 * A chevron over each edge fade of a strip that has more items past that
 * edge. The fade alone could hide a whole item: a strip scrolled to its
 * last tab (the active one) showed no trace of the first. Purely a cue:
 * it lets taps through to the tab beneath and is hidden from assistive
 * technology, which reaches every item anyway. Rendered right after the
 * scroller, inside the track, so it reads the scroller's
 * `data-overflow-*` marks through `peer/strip` and never re-renders.
 * It stays inside the scroller's clear band (`--scroll-fade-clear`, 20px:
 * a 16px glyph plus 2px of inset), where the labels are masked out, so it
 * never draws over text.
 */
export function StripEdgeCues({ variant }: { variant: StripVariant }): ReactNode {
  const cue =
    "pointer-events-none absolute inset-y-0 flex w-5 items-center text-fg-muted opacity-0 transition-opacity duration-fast [&_svg]:size-4";
  return (
    <>
      <span
        aria-hidden="true"
        data-strip-cue="start"
        className={cn(
          cue,
          "left-0 pl-0.5 peer-data-[overflow-start]/strip:opacity-100",
          // An underline strip runs into the phone's gutter; so does its cue.
          variant === "underline" && "max-sm:-left-4",
        )}
      >
        <ChevronLeft />
      </span>
      <span
        aria-hidden="true"
        data-strip-cue="end"
        className={cn(
          cue,
          "right-0 justify-end pr-0.5 peer-data-[overflow-end]/strip:opacity-100",
          variant === "underline" && "max-sm:-right-4",
        )}
      >
        <ChevronRight />
      </span>
    </>
  );
}

const ITEM_SIZE: Record<StripVariant, Record<StripSize, string>> = {
  // A pill item stays compact under a mouse; on a touch screen it grows to
  // 36px and its hit area reaches 44px into the track's padding.
  pill: {
    sm: "h-6 px-3 pointer-coarse:h-9 pointer-coarse:px-4",
    md: "h-8 px-4 pointer-coarse:h-9",
  },
  underline: {
    sm: "h-9 px-2.5 pointer-coarse:h-11",
    md: "h-11 px-3",
  },
};

/** Everything an item shares; the caller adds its active-state classes. */
export function stripItemClass(
  variant: StripVariant,
  size: StripSize,
  fullWidth?: boolean,
): string {
  return cn(
    "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap select-none",
    "text-label text-fg-muted transition-colors hover:text-fg",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    "disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    variant === "pill"
      ? "rounded-full focus-visible:outline-offset-0 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1"
      : "rounded-sm focus-visible:-outline-offset-2",
    ITEM_SIZE[variant][size],
    fullWidth && "flex-1",
  );
}

/**
 * A count after an item's label ("Menunggu 3"). The leading space keeps
 * label and number apart in the accessible name; the flex gap does the
 * visual spacing. `activeClassName` turns it accent-soft on the active
 * item, keyed to that component's own state selector on the `group/tab`
 * item, so the chip follows the state without React knowing it.
 */
export function StripCount({
  count,
  variant,
  activeClassName,
}: {
  count: number;
  variant: StripVariant;
  activeClassName: string;
}): ReactNode {
  return (
    <>
      {" "}
      <span
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption tabular-nums transition-colors",
          variant === "pill" ? "bg-surface text-fg-muted" : "bg-surface-sunken text-fg-muted",
          activeClassName,
        )}
      >
        {count}
      </span>
    </>
  );
}
