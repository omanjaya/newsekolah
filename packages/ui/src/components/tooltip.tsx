"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

const InsideTooltipProvider = createContext(false);

/**
 * Radix's provider (shared open and skip delays), plus a marker so
 * components that add their own tooltip (IconButton) know whether they
 * still need to bring one.
 */
export function TooltipProvider(
  props: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>,
): ReactElement {
  return (
    <InsideTooltipProvider.Provider value={true}>
      <TooltipPrimitive.Provider {...props} />
    </InsideTooltipProvider.Provider>
  );
}

/** Wraps `children` in a provider only when no `TooltipProvider` is above them. */
export function EnsureTooltipProvider({ children }: { children: ReactNode }): ReactNode {
  const inside = useContext(InsideTooltipProvider);
  if (inside) return children;
  return <TooltipProvider delayDuration={400}>{children}</TooltipProvider>;
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * Compact: caption text, 14px radius (a pill on one line), elevation 2.
 * In the light theme it is inverse, a dark pill, so it stands apart from
 * the white card or button it describes; in the dark theme it is the
 * raised surface of menus and popovers (`--tooltip-*` in styles.css). It
 * fades and moves 4px away from its trigger on the way in and back on the
 * way out, and never takes the pointer.
 */
export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-tooltip max-w-64 rounded-md border border-(--tooltip-border) bg-(--tooltip-bg) px-2.5 py-1.5 text-caption text-(--tooltip-fg) shadow-2",
          "pointer-events-none select-none",
          "data-[state=delayed-open]:animate-popover-in data-[state=instant-open]:animate-popover-in data-[state=closed]:animate-popover-out",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
