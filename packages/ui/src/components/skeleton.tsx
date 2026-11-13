import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

/**
 * Shape-of-content placeholder with a slow (1.5s, linear) shimmer, all of
 * it in the `skeleton` utility (styles.css). It is the only looping motion
 * besides spinners and the live dot, and it stops under
 * `prefers-reduced-motion`. Fade the real content in with `animate-fade-in`
 * when it replaces the skeleton. Not for an absolutely positioned box: the
 * skeleton positions itself to hold its highlight.
 */
export function Skeleton({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      role="presentation"
      data-slot="skeleton"
      className={cn("skeleton rounded-xs", className)}
      {...props}
    />
  );
}
