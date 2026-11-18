import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

/**
 * A single keyboard key ("Ctrl", "K", "Esc"), e.g. in the `?` shortcuts
 * screen or the command palette's footer: a small raised keycap with a
 * 1px ring and a slightly heavier bottom edge. Icons (arrow keys) are
 * sized to the caption text.
 */
export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-0.5 rounded-xs px-1.5",
        "bg-surface font-sans text-caption text-fg-muted",
        "shadow-[inset_0_0_0_1px_var(--color-border),inset_0_-1px_0_1px_var(--color-border)]",
        "[&>svg]:size-3",
        className,
      )}
      {...props}
    />
  );
}
