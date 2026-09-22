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
    // Rectangular, not pill-shaped: DESIGN.md reserves radius 999 for avatars
    // only, so the track uses radius-sm (8) and the thumb radius-xs (4).
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-sm border border-border bg-bg transition-colors",
        // Same trick as the checkbox: the switch keeps its size, the area
        // a thumb can hit grows around it and moves nothing.
        "before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] md:before:hidden",
        "duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-3.5 translate-x-0.5 rounded-xs bg-surface transition-transform",
          "duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          "data-[state=checked]:translate-x-[18px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
});
