"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { forwardRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { useFieldControl } from "./field-context.js";
import {
  FIELD_BORDER_CLASSES,
  FIELD_DISABLED_CLASSES,
  FIELD_HEIGHT,
  FIELD_PADDING,
  FIELD_TEXT,
  type FieldSize,
} from "./field-styles.js";
import { useUiLabels } from "./ui-labels.js";

export interface SelectOption {
  value: string;
  label: string;
  /** A second, muted line in the open list (not in the closed field). */
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Defaults to "Pilih" (`UiLabels.selectPlaceholder`). */
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  /** "md" (default) or the compact "sm" of table toolbars; both 44px on touch. */
  size?: FieldSize;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
  /** Set by `FormControl`; the `invalid` prop does the same for a field outside a form. */
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

/**
 * A single-select dropdown for a short, known list. The open list is at
 * least as wide as the field and never taller than the room on screen; it
 * scrolls past 20rem. For a long list or one fetched by search, use
 * `Combobox`.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    options,
    placeholder,
    invalid,
    required,
    disabled,
    size = "md",
    className,
    id,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const labels = useUiLabels();
  const { attributes } = useFieldControl({
    id,
    required,
    disabled,
    invalid,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
  });
  return (
    <SelectPrimitive.Root {...props} disabled={attributes.disabled} required={required}>
      <SelectPrimitive.Trigger
        ref={ref}
        id={attributes.id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={attributes["aria-describedby"]}
        aria-invalid={attributes["aria-invalid"]}
        aria-required={attributes["aria-required"]}
        className={cn(
          // `group/trigger` scopes the chevron's turn to this trigger's own
          // open state: a bare `in-data-[state=open]` would also match an
          // open Dialog, Sheet or Popover around a closed Select.
          "group/trigger flex w-full min-w-0 items-center justify-between gap-2 rounded-md bg-surface text-fg",
          FIELD_HEIGHT[size],
          FIELD_PADDING[size],
          FIELD_TEXT[size],
          FIELD_BORDER_CLASSES,
          FIELD_DISABLED_CLASSES,
          "data-[state=open]:[--field-border:var(--color-accent)]",
          "data-[placeholder]:text-fg-muted",
          className,
        )}
      >
        {/* Left aligned like an input, on one line: a long option is cut
            with an ellipsis rather than wrapping out of a fixed-height box. */}
        <span className="min-w-0 flex-1 truncate text-left">
          <SelectPrimitive.Value placeholder={placeholder ?? labels.selectPlaceholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className="size-4 shrink-0 text-fg-muted transition-transform duration-fast group-data-[state=open]/trigger:rotate-180"
            aria-hidden="true"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            // As wide as the trigger at least, and never taller than the
            // room Radix measures between the trigger and the screen edge:
            // a long list (dozens of classes) scrolls inside the viewport.
            "z-popover min-w-(--radix-select-trigger-width) max-w-[calc(100vw-1rem)]",
            "max-h-(--radix-select-content-available-height)",
            "overflow-hidden rounded-md border border-border bg-surface-raised shadow-2",
            "data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out",
            "data-[state=closed]:pointer-events-none!",
          )}
        >
          <SelectScrollButton direction="up" />
          <SelectPrimitive.Viewport className="max-h-80 p-1">
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                description={option.description}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectPrimitive.Viewport>
          <SelectScrollButton direction="down" />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});

/** Shown by Radix only while the list overflows in that direction. */
function SelectScrollButton({ direction }: { direction: "up" | "down" }) {
  const Button =
    direction === "up" ? SelectPrimitive.ScrollUpButton : SelectPrimitive.ScrollDownButton;
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <Button className="flex h-6 cursor-default items-center justify-center text-fg-muted">
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
}

function SelectItem({
  value,
  disabled,
  description,
  children,
}: {
  value: string;
  disabled?: boolean;
  description?: string;
  children: ReactNode;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className={cn(
        // An option in the open list is tapped too, so it grows the same way.
        // Soft highlight for the pointer, plus the inset focus ring for the keyboard.
        "relative flex min-h-11 cursor-pointer flex-col justify-center rounded-sm py-1.5 pr-9 pl-3 md:pointer-fine:min-h-9",
        "text-body text-fg outline-none transition-colors",
        "data-[highlighted]:bg-state-hover",
        "focus-visible:-outline-offset-2",
        "data-[disabled]:pointer-events-none data-[disabled]:text-fg-muted data-[disabled]:opacity-60",
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {description !== undefined && (
        <span className="text-caption text-fg-muted">{description}</span>
      )}
      <SelectPrimitive.ItemIndicator className="absolute top-1/2 right-3 inline-flex -translate-y-1/2 items-center">
        <Check className="size-4 text-accent" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
