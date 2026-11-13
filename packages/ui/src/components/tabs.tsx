import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        // Never wider than its container: on a phone five or six tabs
        // scroll sideways inside the track instead of pushing the page
        // wider. The 4px padding leaves room for the focus ring, which the
        // scroll container would otherwise clip.
        "inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface-sunken p-1",
        "scrollbar-none overscroll-x-contain",
        className,
      )}
      {...props}
    />
  );
});

export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        // Pill-style active tab (docs/07-ui-ux.md, "Hijau Segar"): the
        // whole trigger is the target, not just an underline, so it clears
        // 44px tall on a phone the same way Button does.
        "flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-label whitespace-nowrap text-fg-muted",
        "md:min-h-0 md:h-8",
        // The active pill's fill and shadow fade in with the text color.
        "transition-[color,background-color,box-shadow]",
        "hover:text-fg",
        "data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-1",
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn("pt-4", className)} {...props} />;
});
