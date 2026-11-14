"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { forwardRef, type ReactNode } from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
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
 * Radix keeps the value "" for "nothing chosen", which shows the
 * placeholder. An option whose own value is "" ("Belum dipilih") travels
 * under this key inside the dropdown and is handed back as "", so the
 * field shows that option's label instead of the placeholder.
 */
const EMPTY_OPTION_VALUE = "__ui-select-empty-option__";

/**
 * A single-select dropdown for a short, known list. The open list is at
 * least as wide as the field and never taller than the room on screen; it
 * scrolls past 20rem. For a long list or one fetched by search, use
 * `Combobox`. An option may have the value "" (an explicit "none"); it is
 * shown by its own label when chosen.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    options,
    value: valueProp,
    defaultValue = "",
    onValueChange,
    name,
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
  const [value, setValue] = useControllableState(valueProp, defaultValue, onValueChange);
  const hasEmptyOption = options.some((option) => option.value === "");
  const toItemValue = (next: string) => (hasEmptyOption && next === "" ? EMPTY_OPTION_VALUE : next);
  return (
    <SelectPrimitive.Root
      value={toItemValue(value)}
      onValueChange={(next) => {
        setValue(next === EMPTY_OPTION_VALUE ? "" : next);
      }}
      // The native select Radix posts would carry the stand-in key; a
      // hidden input posts the real "" instead.
      name={hasEmptyOption ? undefined : name}
      disabled={attributes.disabled}
      required={required}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={attributes.id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={attributes["aria-describedby"]}
        aria-invalid={attributes["aria-invalid"]}
        aria-required={attributes["aria-required"]}
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-2 rounded-md bg-surface text-fg",
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
        {/* The chevron stays still, as on every dropdown field (Combobox,
            TimePicker, the date pickers): the accent border says "open",
            and a turned chevron read as "opens upward" over a list that
            opened below. */}
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      {hasEmptyOption && name !== undefined && (
        <input type="hidden" name={name} value={value} disabled={attributes.disabled} />
      )}
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
                value={toItemValue(option.value)}
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

/**
 * Shown by Radix only while the list overflows in that direction. An
 * opaque strip with a hairline on its list side, so an option scrolled
 * half out of view is cut cleanly at the line rather than sliced under a
 * floating chevron.
 */
function SelectScrollButton({ direction }: { direction: "up" | "down" }) {
  const Button =
    direction === "up" ? SelectPrimitive.ScrollUpButton : SelectPrimitive.ScrollDownButton;
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <Button
      className={cn(
        "flex h-6 shrink-0 cursor-default items-center justify-center bg-surface-raised text-fg-muted",
        direction === "up" ? "border-b border-line" : "border-t border-line",
      )}
    >
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
