import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

/**
 * Shape-of-content placeholder, not a shimmering brand moment: DESIGN.md
 * caps skeleton motion at 1 second before a real loading state should take
 * over. The pulse itself respects `prefers-reduced-motion` via styles.css.
 */
export function Skeleton({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      role="presentation"
      className={cn("animate-pulse rounded-xs bg-border/60", className)}
      {...props}
    />
  );
}
