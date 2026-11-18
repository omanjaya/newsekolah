"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { SwitchProps as RadixSwitchProps } from "@radix-ui/react-switch";
import { forwardRef } from "react";

import { cn } from "../utils/cn.js";

import { useFieldControl } from "./field-context.js";

export type SwitchProps = RadixSwitchProps & {
  /** Danger ring, as on the other controls; a surrounding `Field` with an error sets it too. */
  invalid?: boolean;
};

/**
 * A pill track with a round thumb, one family with the pill tabs and
 * badges. Off: a sunken track inside a `border-strong` ring (3:1 against
 * any surface) and a smaller muted thumb, so an off switch never reads as
 * an empty cell. On: the accent fill and a full-size thumb on the accent's
 * label color. The thumb slides and grows with transform only (200ms; it
 * jumps under reduced motion). 36x20 under a mouse, 44x24 on a touch
 * screen, where the hit area also reaches 44px tall.
 *
 * Inside a `Field` it takes the field's id (so the field's label names
 * it), its hint and error as the description, and its disabled state,
 * like every other control: `<Field label="Terbitkan"><Switch /></Field>`.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    className,
    id,
    required,
    disabled,
    invalid,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const { attributes } = useFieldControl({
    id,
    required,
    disabled,
    invalid,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
  });
  return (
    <SwitchPrimitive.Root
      ref={ref}
      {...props}
      id={attributes.id}
      required={required}
      disabled={attributes.disabled}
      aria-describedby={attributes["aria-describedby"]}
      aria-invalid={attributes["aria-invalid"]}
      aria-required={attributes["aria-required"]}
      className={cn(
        "group relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
        "pointer-coarse:h-6 pointer-coarse:w-11 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5",
        "border border-border-strong bg-surface-sunken transition-colors hover:border-fg-muted",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:hover:border-accent-strong data-[state=checked]:hover:bg-accent-strong",
        "aria-invalid:border-danger aria-invalid:hover:border-danger",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-fg-muted motion-indicator pointer-coarse:size-5",
          // 2px in from the left edge off, 2px in from the right edge on.
          "translate-x-px scale-75 data-[state=checked]:translate-x-[17px] data-[state=checked]:scale-100 data-[state=checked]:bg-accent-fg",
          "pointer-coarse:data-[state=checked]:translate-x-[21px]",
          "data-[state=checked]:shadow-1",
          // Pressing gives under the finger: the thumb gives a little.
          "group-active:data-[state=unchecked]:scale-[0.85] group-active:data-[state=checked]:scale-90",
        )}
      />
    </SwitchPrimitive.Root>
  );
});
