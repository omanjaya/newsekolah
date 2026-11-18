"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>;
type CollisionPadding = NonNullable<PopoverContentProps["collisionPadding"]>;

/**
 * How far above the bottom edge a popover keeps on a phone that shows the
 * app's tab bar: the bar, its raised centre and the home indicator, the
 * `--shell-mobile-tab-offset` that `StickySaveBar` keeps clear of too. 0
 * with no bar on screen (a wider screen, the kiosk, a sign-in page) or no
 * document.
 */
function tabBarClearance(): number {
  if (typeof document === "undefined") return 0;
  const bar = document.querySelector("[data-tab-bar]");
  // A bar hidden by its breakpoint has no boxes.
  if (!bar || bar.getClientRects().length === 0) return 0;
  // The offset is a calc() with env(): a probe resolves it to pixels.
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;height:var(--shell-mobile-tab-offset,0px)";
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

function withBottomClearance(padding: CollisionPadding, clearance: number): CollisionPadding {
  if (clearance <= 0) return padding;
  if (typeof padding === "number") {
    return { top: padding, right: padding, left: padding, bottom: padding + clearance };
  }
  return { ...padding, bottom: (padding.bottom ?? 0) + clearance };
}

/**
 * The raised surface every floating panel shares with menus and selects:
 * 14px radius, a 1px ring and elevation 2, above dialogs in the stacking
 * order so a popover opened inside a dialog is never covered. It fades and
 * moves 4px away from its anchor and keeps 8px from the screen edges, and
 * on a phone clear of the tab bar as well, flipping above its anchor
 * rather than running over the bar's centre button.
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  function PopoverContent(props, ref) {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPanel ref={ref} {...props} />
      </PopoverPrimitive.Portal>
    );
  },
);

/** The content itself: mounted only while open, so it measures the tab bar once per opening. */
const PopoverPanel = forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverPanel(
  { className, sideOffset = 6, collisionPadding = 8, ...props },
  ref,
) {
  const [clearance] = useState(tabBarClearance);
  return (
    <PopoverPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={withBottomClearance(collisionPadding, clearance)}
      className={cn(
        "z-popover w-72 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-surface-raised p-4 text-body text-fg shadow-2",
        "origin-(--radix-popover-content-transform-origin) outline-none",
        "data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out",
        "data-[state=closed]:pointer-events-none!",
        className,
      )}
      {...props}
    />
  );
});
