import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import type { CheckboxProps as RadixCheckboxProps } from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { forwardRef } from "react";

import { cn } from "../utils/cn.js";

export type CheckboxProps = RadixCheckboxProps;

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref,
) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "flex size-4 items-center justify-center rounded-xs border border-border bg-surface",
        // The box stays 16px, which is what a checkbox should look like.
        // The area a thumb can hit grows around it instead, through a
        // transparent overlay, so nothing in the layout shifts.
        "relative before:absolute before:-inset-3.5 before:content-[''] md:before:hidden",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3 text-accent-fg" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
