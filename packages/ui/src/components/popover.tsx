import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/**
 * The raised surface every floating panel shares with menus and selects:
 * 14px radius, a 1px ring and elevation 2, above dialogs in the stacking
 * order so a popover opened inside a dialog is never covered. It fades and
 * moves 4px away from its anchor and keeps 8px from the screen edges.
 */
export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-popover w-72 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-surface-raised p-4 text-body text-fg shadow-2",
          "origin-(--radix-popover-content-transform-origin) outline-none",
          "data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out",
          "data-[state=closed]:pointer-events-none!",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
