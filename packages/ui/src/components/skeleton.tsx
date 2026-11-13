import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

/**
 * Shape-of-content placeholder with a slow (1.5s, linear) shimmer. It is
 * the only looping motion besides spinners and the live dot, and it stops
 * under `prefers-reduced-motion` (styles.css). Fade the real content in
 * with `animate-fade-in` when it replaces the skeleton.
 */
export function Skeleton({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      role="presentation"
      data-slot="skeleton"
      className={cn("skeleton animate-shimmer rounded-xs", className)}
      {...props}
    />
  );
}
