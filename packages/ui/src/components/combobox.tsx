"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronDown } from "lucide-react";
import { forwardRef, useState } from "react";

import { cn } from "../utils/cn.js";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

/**
 * A single-select field backed by server-side search: typing calls
 * `onSearchChange` so the caller can debounce and refetch, and the list
 * renders exactly the `options` given rather than re-filtering them
 * client-side, since the server may match fields the label does not show
 * (e.g. an eligible-substitutes search that also matches a username).
 * For a fixed, already-loaded option list, use `Select` instead.
 */
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  {
    options,
    value,
    onValueChange,
    search,
    onSearchChange,
    placeholder = "Pilih",
    searchPlaceholder = "Cari",
    emptyLabel,
    loadingLabel = "Memuat...",
    loading,
    disabled,
    invalid,
    className,
    ...aria
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        ref={ref}
        type="button"
        disabled={disabled}
        aria-invalid={invalid ?? undefined}
        className={cn(
          // Matches Input and Select: thumb-sized on a phone, compact once
          // there is a cursor.
          "flex h-11 md:h-9 w-full items-center justify-between gap-2 rounded-xs border border-border",
          "bg-surface px-3 text-[14px] text-fg",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          "focus-visible:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          invalid && "border-status-absent",
          className,
        )}
        {...aria}
      >
        <span className={cn("truncate text-left", !selected && "text-fg-muted")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            "z-(--z-popover) w-72 overflow-hidden rounded-md border border-border bg-surface",
            "shadow-(--shadow-float) data-[state=open]:animate-overlay-in",
          )}
        >
          <CommandPrimitive shouldFilter={false} className="flex flex-col">
            <CommandPrimitive.Input
              value={search}
              onValueChange={onSearchChange}
              placeholder={searchPlaceholder}
              className={cn(
                "h-11 md:h-9 w-full border-b border-border bg-transparent px-3 text-[14px] text-fg outline-none",
                "placeholder:text-fg-muted",
              )}
            />
            <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1">
              <CommandPrimitive.Empty className="px-3 py-6 text-center text-[13px] text-fg-muted">
                {loading ? loadingLabel : emptyLabel}
              </CommandPrimitive.Empty>
              {options.map((option) => (
                <CommandPrimitive.Item
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-11 md:h-9 cursor-pointer items-center justify-between gap-2 rounded-xs px-3",
                    "text-[14px] text-fg outline-none",
                    "data-[selected=true]:bg-bg",
                  )}
                >
                  <span className="flex flex-col overflow-hidden text-left">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="truncate text-[12px] text-fg-muted">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {option.value === value && (
                    <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  )}
                </CommandPrimitive.Item>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
