"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

export type RadioGroupVariant = "default" | "card";

const VariantContext = createContext<RadioGroupVariant>("default");

export interface RadioGroupProps extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  /**
   * "default" is a list of radios with labels; "card" makes every option a
   * bordered card (title, description, optional icon), for choices that need
   * explaining. Lay cards out with `className` (e.g. "sm:grid-cols-2").
   */
  variant?: RadioGroupVariant;
}

/**
 * One choice out of a few, all visible (for a long list, use `Select`).
 * Radix underneath: arrow keys move and select, Tab enters at the checked
 * option, and a `name` posts with a native form. Give the group a name
 * with `aria-label` or `aria-labelledby`.
 */
export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(
  { className, variant = "default", orientation, ...props },
  ref,
) {
  return (
    <VariantContext.Provider value={variant}>
      <RadioGroupPrimitive.Root
        ref={ref}
        orientation={orientation}
        className={cn(
          variant === "card"
            ? "grid gap-2"
            : orientation === "horizontal"
              ? "flex flex-wrap gap-x-6"
              : "flex flex-col",
          className,
        )}
        {...props}
      />
    </VariantContext.Provider>
  );
});

export interface RadioGroupItemProps extends Omit<
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
  "children"
> {
  label: ReactNode;
  description?: ReactNode;
  /** Card variant only: an icon in a soft circle before the text. */
  icon?: ReactNode;
  /**
   * Lands on the item's outer box in both variants: the row holding the
   * radio and its label in the list, the card itself (which is the radio)
   * in the card variant. Use it for layout, not to restyle the dot.
   */
  className?: string;
}

/**
 * Filled accent circle with a light dot when checked, the same language as
 * `Checkbox`: the empty ring is `border-strong` (3:1 on every surface) and
 * darkens on hover, the same steps a field border takes.
 */
function RadioDot(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface",
        "transition-colors group-hover:border-fg-muted group-active:bg-state-pressed",
        "group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent",
        "group-disabled:border-border group-disabled:bg-surface-sunken",
      )}
    >
      <RadioGroupPrimitive.Indicator className="size-1.5 rounded-full bg-accent-fg" />
    </span>
  );
}

export const RadioGroupItem = forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  function RadioGroupItem(
    { label, description, icon, className, id: idProp, onClick, ...props },
    ref,
  ) {
    const variant = useContext(VariantContext);
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const labelId = `${id}-label`;
    const descriptionId = description ? `${id}-description` : undefined;
    // A click on the label (or, in Safari, on the button itself) leaves
    // focus where it was; a native radio would take it, and the arrow keys
    // only work from the group.
    const focusOnClick = (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      event.currentTarget.focus();
    };

    if (variant === "card") {
      return (
        <RadioGroupPrimitive.Item
          ref={ref}
          id={id}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          className={cn(
            "group flex w-full gap-3 rounded-md border border-border bg-surface p-4 text-left",
            // A title alone centres on the icon; with a description the
            // title sits level with the top of the icon instead.
            description === undefined ? "items-center" : "items-start",
            // Hover and press paint over the card's own surface.
            "transition-[color,background-color,border-color,box-shadow] data-[state=unchecked]:state-layer",
            "data-[state=unchecked]:hover:border-border-strong",
            "data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          onClick={focusOnClick}
          {...props}
        >
          {icon !== undefined && (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-fg-muted [&>svg]:size-5",
                "transition-colors",
                "group-data-[state=checked]:bg-surface group-data-[state=checked]:text-accent",
              )}
            >
              {icon}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span id={labelId} className="text-body font-semibold text-fg">
              {label}
            </span>
            {description !== undefined && (
              <span id={descriptionId} className="text-body-sm text-fg-muted">
                {description}
              </span>
            )}
          </span>
          <span className="flex h-5 items-center">
            <RadioDot />
          </span>
        </RadioGroupPrimitive.Item>
      );
    }

    return (
      <div className={cn("flex gap-3 py-2.5 md:pointer-fine:py-1.5", className)}>
        {/* The dot stays 16px; wherever the pointer is coarse the button
            around it is a 44px target whose negative margin hands the space
            back, as Checkbox does. */}
        <span className="flex h-5 shrink-0 items-center">
          <RadioGroupPrimitive.Item
            ref={ref}
            id={id}
            aria-describedby={descriptionId}
            className={cn(
              "group relative -m-3.5 inline-flex size-11 shrink-0 items-center justify-center",
              "focus-visible:outline-none md:pointer-fine:m-0 md:pointer-fine:size-4 disabled:cursor-not-allowed",
              "[&:focus-visible>span]:outline-2 [&:focus-visible>span]:outline-offset-2 [&:focus-visible>span]:outline-focus-ring",
            )}
            onClick={focusOnClick}
            {...props}
          >
            <RadioDot />
          </RadioGroupPrimitive.Item>
        </span>
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
  },
);
