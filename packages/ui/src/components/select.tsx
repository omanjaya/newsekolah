import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { forwardRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

/** A single-select dropdown. For multi-select or async search, use CommandPalette instead. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    options,
    placeholder = "Pilih",
    invalid,
    className,
    id,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  return (
    <SelectPrimitive.Root {...props}>
      <SelectPrimitive.Trigger
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid ?? undefined}
        className={cn(
          // Matches Input and Button: thumb-sized on a phone, compact once
          // there is a cursor.
          "flex h-11 md:h-9 w-full items-center justify-between gap-2 rounded-xs border border-border",
          "bg-surface px-3 text-[14px] text-fg",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          "focus-visible:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[placeholder]:text-fg-muted",
          invalid && "border-status-absent",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            "z-(--z-popover) overflow-hidden rounded-sm border border-border bg-surface",
            "shadow-(--shadow-float)",
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});

function SelectItem({
  value,
  disabled,
  children,
}: {
  value: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className={cn(
        // An option in the open list is tapped too, so it grows the same way.
        "relative flex h-11 md:h-9 cursor-pointer items-center rounded-xs px-3 pr-8 text-[14px] text-fg outline-none",
        "data-[highlighted]:bg-bg data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center">
        <Check className="size-4 text-accent" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
