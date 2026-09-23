import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { SwitchProps as RadixSwitchProps } from "@radix-ui/react-switch";
import { forwardRef } from "react";

import { cn } from "../utils/cn.js";

export type SwitchProps = RadixSwitchProps;

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, ...props },
  ref,
) {
  return (
    // Same approach as the checkbox: the track keeps its 36x20 size, while
    // on a phone the button around it is a 44px-tall touch target whose
    // negative margin gives the extra space back to the layout.
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "group relative inline-flex shrink-0 items-center justify-center",
        "h-11 w-13 -mx-2 -my-3 md:m-0 md:h-5 md:w-9",
        "disabled:cursor-not-allowed focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      {/*
        Rectangular, not pill-shaped: DESIGN.md reserves radius 999 for
        avatars only, so the track uses radius-sm (8) and the thumb
        radius-xs (4).
      */}
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 w-9 shrink-0 items-center rounded-sm border border-border bg-bg transition-colors",
          "duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          "group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent",
          "group-disabled:opacity-50",
          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "block size-3.5 translate-x-0.5 rounded-xs bg-surface transition-transform",
            "duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
            "data-[state=checked]:translate-x-[18px]",
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  );
});
