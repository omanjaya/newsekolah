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
      className={cn("inline-flex w-fit items-center gap-1 rounded-full bg-bg p-1", className)}
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
        "flex min-h-11 items-center justify-center rounded-full px-4 text-[13px] font-medium text-fg-muted",
        "md:min-h-0 md:h-8",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "hover:text-fg",
        "data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-(--shadow-card)",
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
