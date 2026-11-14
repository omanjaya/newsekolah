"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import type { CheckboxProps as RadixCheckboxProps } from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { forwardRef, useId, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

export type CheckboxProps = RadixCheckboxProps & {
  /**
   * A visible label beside the box. Clicking it toggles the box, and it
   * names the checkbox; without it, give the box an `aria-label`.
   */
  label?: ReactNode;
  /** A muted second line under the label. */
  description?: ReactNode;
  /** Danger border on the box (e.g. "accept the terms" left unticked). */
  invalid?: boolean;
  /** With `label`: className of the row holding the box and its text. */
  containerClassName?: string;
};

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { className, label, description, invalid, containerClassName, id: idProp, ...props },
  ref,
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const descriptionId = description !== undefined ? `${id}-description` : undefined;

  const box = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={label !== undefined ? id : idProp}
      aria-invalid={invalid === true ? true : undefined}
      aria-describedby={descriptionId}
      className={cn(
        // The box stays 16px, which is what a checkbox should look like, but
        // wherever the pointer is coarse (and on any narrow screen) the
        // button itself is a 44px touch target around it. The negative
        // margin hands the extra 28px back, so the layout is exactly what a
        // 16px control would occupy and nothing shifts. Being the real
        // element (not an overlay) is what assistive tech and audits
        // measure, too.
        "group relative inline-flex shrink-0 items-center justify-center",
        "-m-3.5 size-11 md:pointer-fine:m-0 md:pointer-fine:size-4",
        "disabled:cursor-not-allowed focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 items-center justify-center rounded-xs border border-border-strong bg-surface",
          "transition-colors group-hover:border-fg-muted group-active:bg-state-pressed",
          // Checked and indeterminate ("some rows selected") both fill with
          // the accent, so a partial selection never looks unticked.
          "group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent",
          "group-data-[state=indeterminate]:border-accent group-data-[state=indeterminate]:bg-accent",
          "group-aria-invalid:border-danger",
          // Half the resting ring, as RadioGroup's: plain `border` all but
          // vanished on the sunken fill in dark.
          "group-disabled:border-border-strong/50 group-disabled:bg-surface-sunken",
          "group-disabled:group-data-[state=checked]:opacity-50",
          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus-ring",
        )}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-accent-fg">
          <Check
            className="size-3 group-data-[state=indeterminate]:hidden"
            strokeWidth={3}
            aria-hidden="true"
          />
          <Minus
            className="hidden size-3 group-data-[state=indeterminate]:block"
            strokeWidth={3}
            aria-hidden="true"
          />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );

  if (label === undefined) return box;

  return (
    <div className={cn("flex gap-3 py-2.5 md:pointer-fine:py-1.5", containerClassName)}>
      {/* The 16px box centred on the label's first 20px line. */}
      <span className="flex h-5 shrink-0 items-center">{box}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <label
          htmlFor={id}
          className={cn(
            "text-body",
            props.disabled ? "cursor-not-allowed text-fg-muted" : "cursor-pointer text-fg",
          )}
        >
          {label}
        </label>
        {description !== undefined && (
          <span id={descriptionId} className="text-body-sm text-fg-muted">
            {description}
          </span>
        )}
      </span>
    </div>
  );
});
