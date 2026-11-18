"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { useActiveIndicator } from "../hooks/use-active-indicator.js";
import { useScrollEdges } from "../hooks/use-scroll-edges.js";
import { cn } from "../utils/cn.js";

import {
  StripCount,
  stripIndicatorClass,
  stripItemClass,
  stripScrollerClass,
  stripTrackClass,
  type StripSize,
  type StripVariant,
} from "./tab-styles.js";

export type TabsVariant = StripVariant;
export type TabsSize = StripSize;

interface TabsListContextValue {
  variant: TabsVariant;
  size: TabsSize;
  fullWidth: boolean;
}

const TabsListContext = createContext<TabsListContextValue>({
  variant: "pill",
  size: "md",
  fullWidth: false,
});

export const Tabs = TabsPrimitive.Root;

export interface TabsListProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /**
   * "pill" (default): a sunken track with a raised pill under the active
   * tab, for switching views inside a section. "underline": a line with an
   * accent bar, for the top level of a detail page.
   */
  variant?: TabsVariant;
  /** "md" (default) or "sm" for a compact strip in a toolbar or card header. */
  size?: TabsSize;
  /** Stretch across the container, the tabs sharing the width equally. */
  fullWidth?: boolean;
}

/**
 * Always one row. A list wider than its container scrolls sideways inside
 * its own track, with fades at the edges that have more tabs past them,
 * instead of wrapping or pushing the page wider; the active tab is
 * scrolled into view. The active indicator slides between tabs (200ms,
 * transform only, a jump under reduced motion).
 */
export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { className, variant = "pill", size = "md", fullWidth = false, children, ...props },
  ref,
) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useScrollEdges(scrollerRef, { axis: "x" });
  useActiveIndicator(scrollerRef, indicatorRef, '[role="tab"][data-state="active"]');

  return (
    <TabsListContext.Provider value={{ variant, size, fullWidth }}>
      <TabsPrimitive.List
        ref={ref}
        data-variant={variant}
        className={cn(
          stripTrackClass(variant, fullWidth),
          className,
          // A caller's `flex-wrap` (a workaround from before the strip
          // scrolled) must not turn the track into a two-row capsule.
          "flex-nowrap",
        )}
        {...props}
      >
        <div ref={scrollerRef} data-strip="" className={stripScrollerClass(variant)}>
          <span ref={indicatorRef} aria-hidden="true" className={stripIndicatorClass(variant)} />
          {children}
        </div>
      </TabsPrimitive.List>
    </TabsListContext.Provider>
  );
});

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /**
   * A count after the label, e.g. pending items behind this tab. A count of
   * 0 shows nothing, as with CountBadge: an empty tab needs no "0" chip.
   */
  count?: number;
  /** Shows a count of 0 too (a tally where zero is news, not absence). */
  showZero?: boolean;
  /** A Lucide icon before the label, sized for you. */
  icon?: ReactNode;
}

const ACTIVE_COUNT =
  "group-data-[state=active]/tab:bg-accent-soft group-data-[state=active]/tab:text-accent-soft-fg";

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { className, count, showZero = false, icon, children, ...props },
  ref,
) {
  const { variant, size, fullWidth } = useContext(TabsListContext);
  const showCount = count !== undefined && (count > 0 || showZero);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "group/tab",
        stripItemClass(variant, size, fullWidth),
        "data-[state=active]:text-fg",
        variant === "pill"
          ? [
              // Until the sliding indicator is placed (server render, no
              // JS) the active tab paints its own pill.
              "[[data-strip]:not([data-indicator=ready])_&]:data-[state=active]:bg-surface-raised [[data-strip]:not([data-indicator=ready])_&]:data-[state=active]:shadow-1",
              "data-[state=inactive]:hover:bg-state-hover data-[state=inactive]:active:bg-state-pressed",
            ]
          : [
              "[[data-strip]:not([data-indicator=ready])_&]:data-[state=active]:shadow-[inset_0_-2px_0_var(--color-accent)]",
              "data-[state=inactive]:hover:bg-state-hover data-[state=inactive]:active:bg-state-pressed",
            ],
        className,
      )}
      {...props}
    >
      {icon !== undefined && (
        <span className="flex shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
      {showCount && (
        <StripCount count={Math.max(0, count)} variant={variant} activeClassName={ACTIVE_COUNT} />
      )}
    </TabsPrimitive.Trigger>
  );
});

export const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn("pt-4 focus-visible:rounded-sm", className)}
      {...props}
    />
  );
});
