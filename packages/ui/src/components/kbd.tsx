import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

/** A single keyboard key, e.g. for documenting the `?` shortcuts screen. */
export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border",
        "bg-bg px-1 font-sans text-[12px] font-medium text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
