"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronDown, Loader2, Search, SearchX } from "lucide-react";
import { forwardRef, useId, useState } from "react";

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

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  /**
   * The search text, for a server-side search: the caller refetches
   * `options` from it. Leave `search` and `onSearchChange` out for a list
   * that is already loaded (a roster the page holds): the Combobox then
   * keeps the text itself and narrows `options` by label and description,
   * ignoring case and accents.
   */
  search?: string;
  /** Called on every keystroke of a server-side search; see `search`. */
  onSearchChange?: (search: string) => void;
  /** Defaults to `UiLabels.comboboxPlaceholder`. */
  placeholder?: string;
  /** Defaults to `UiLabels.comboboxSearchPlaceholder`. */
  searchPlaceholder?: string;
  /** Shown when a finished search matched nothing. Defaults to `UiLabels.comboboxEmpty`. */
  emptyLabel?: string;
  /** Shown while `loading` and there is nothing to list yet. Defaults to `UiLabels.comboboxLoading`. */
  loadingLabel?: string;
  /** A search is in flight: a spinner in the search box, and the loading row while the list is empty. */
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  size?: FieldSize;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  className?: string;
}

/** Lower case without accents, so "jose" finds "José" and "ANI" finds "Ani". */
function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

/** The options whose label or description contains every word typed. */
function filterOptions(options: ComboboxOption[], search: string): ComboboxOption[] {
  const words = foldForSearch(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const haystack = foldForSearch(`${option.label} ${option.description ?? ""}`);
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * A single-select field with a search box, in one of two modes.
 *
 * - Server-side search (`search` and `onSearchChange` given): typing calls
 *   `onSearchChange` so the caller can debounce and refetch, and the list
 *   renders exactly the `options` given rather than re-filtering them,
 *   since the server may match fields the label does not show (e.g. an
 *   eligible-substitutes search that also matches a username).
 * - Local filtering (both left out): for a long list already loaded, such
 *   as a school's eighty staff, the Combobox narrows `options` itself by
 *   label and description; the text clears when the list closes.
 *
 * The field and its list are `Select`'s: same height, radius, border,
 * option rows and popover. For a short fixed list, use `Select`.
 */
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  {
    options,
    value,
    onValueChange,
    search: searchProp,
    onSearchChange,
    placeholder,
    searchPlaceholder,
    emptyLabel,
    loadingLabel,
    loading = false,
    disabled,
    invalid,
    required,
    size = "md",
    className,
    id,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    ...aria
  },
  ref,
) {
  const labels = useUiLabels();
  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const filtersLocally = onSearchChange === undefined;
  const search = filtersLocally ? localSearch : (searchProp ?? "");
  const listed = filtersLocally ? filterOptions(options, localSearch) : options;
  const requiredId = useId();
  const selected = options.find((option) => option.value === value);
  const { attributes } = useFieldControl({
    id,
    required,
    disabled,
    invalid,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
  });
  // The trigger is a button, which cannot carry aria-required; a required
  // field (its own `required` or a required `Field`) says so in the
  // trigger's description instead, from a node kept out of reading order.
  const isRequired = attributes["aria-required"] === true;
  const describedBy =
    [attributes["aria-describedby"], isRequired && requiredId].filter(Boolean).join(" ") ||
    undefined;
  const showLoadingRow = loading && listed.length === 0;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setLocalSearch("");
      }}
    >
      <PopoverPrimitive.Trigger
        ref={ref}
        type="button"
        id={attributes.id}
        disabled={attributes.disabled}
        aria-describedby={describedBy}
        aria-invalid={attributes["aria-invalid"]}
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-2 rounded-md bg-surface text-fg",
          FIELD_HEIGHT[size],
          FIELD_PADDING[size],
          FIELD_TEXT[size],
          FIELD_BORDER_CLASSES,
          FIELD_DISABLED_CLASSES,
          "data-[state=open]:[--field-border:var(--color-accent)]",
          className,
        )}
        {...aria}
      >
        <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-fg-muted")}>
          {selected ? selected.label : (placeholder ?? labels.comboboxPlaceholder)}
        </span>
        {/* A still chevron, as on every dropdown field: the accent border is the open state. */}
        <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      {isRequired && (
        <span id={requiredId} hidden>
          {labels.fieldRequired}
        </span>
      )}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            // Like Select's list: at least as wide as the field (never a
            // fixed 18rem that a wide form field outgrows) and capped to the
            // room left on screen.
            // A flex column, so when that room is short the list (not the
            // search field) gives way and stays scrollable to its last option.
            "z-popover flex w-(--radix-popover-trigger-width) min-w-72 max-w-[calc(100vw-1rem)] flex-col",
            "max-h-(--radix-popover-content-available-height) overflow-hidden",
            "rounded-md border border-border bg-surface-raised shadow-2",
            "data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out",
            "data-[state=closed]:pointer-events-none!",
          )}
        >
          <CommandPrimitive shouldFilter={false} className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-3">
              <Search className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <CommandPrimitive.Input
                value={search}
                onValueChange={onSearchChange ?? setLocalSearch}
                placeholder={searchPlaceholder ?? labels.comboboxSearchPlaceholder}
                className={cn(
                  "h-11 min-w-0 flex-1 bg-transparent text-fg outline-none md:pointer-fine:h-10",
                  FIELD_TEXT.md,
                  "placeholder:text-fg-muted focus-visible:outline-none",
                )}
              />
              {loading && (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-fg-muted"
                  aria-hidden="true"
                />
              )}
            </div>
            <CommandPrimitive.List
              aria-busy={loading || undefined}
              className="max-h-64 min-h-0 flex-1 overflow-y-auto p-1"
            >
              {showLoadingRow ? (
                <CommandPrimitive.Loading>
                  <div className="flex items-center justify-center gap-2 px-3 py-6 text-body-sm text-fg-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {loadingLabel ?? labels.comboboxLoading}
                  </div>
                </CommandPrimitive.Loading>
              ) : (
                <CommandPrimitive.Empty className="flex flex-col items-center gap-2 px-3 py-6 text-center text-body-sm text-fg-muted">
                  <SearchX className="size-5" aria-hidden="true" />
                  {emptyLabel ?? labels.comboboxEmpty}
                </CommandPrimitive.Empty>
              )}
              {listed.map((option) => (
                <CommandPrimitive.Item
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                    setLocalSearch("");
                  }}
                  className={cn(
                    // Select's option row: same height, radius and highlight.
                    "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-sm py-1.5 pr-3 pl-3 md:pointer-fine:min-h-9",
                    "text-body text-fg outline-none",
                    "transition-colors data-[selected=true]:bg-state-hover",
                  )}
                >
                  <span className="flex min-w-0 flex-col text-left">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="truncate text-caption text-fg-muted">
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
