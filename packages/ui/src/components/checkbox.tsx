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
        // The box stays 16px, which is what a checkbox should look like, but
        // on a phone the button itself is a 44px touch target around it.
        // The negative margin hands the extra 28px back, so the layout is
        // exactly what a 16px control would occupy and nothing shifts.
        // Being the real element (not an overlay) is what assistive tech and
        // audits measure, too.
        "group relative inline-flex shrink-0 items-center justify-center",
        "size-11 -m-3.5 md:m-0 md:size-4",
        "disabled:cursor-not-allowed focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 items-center justify-center rounded-xs border border-border bg-surface",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          "group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent",
          "group-disabled:opacity-50",
          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent",
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Check className="size-3 text-accent-fg" aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
});
