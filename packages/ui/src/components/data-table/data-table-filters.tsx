"use client";

import { Check, X } from "lucide-react";
import { useState, type ReactElement } from "react";

import { cn } from "../../utils/cn.js";
import { Popover, PopoverContent, PopoverTrigger } from "../popover.js";

export interface DataTableFilterOption {
  value: string;
  label: string;
}

export interface DataTableFilterDef {
  /** Stable key for the filter, e.g. "material_type" -- not shown to the user. */
  id: string;
  /** Visible label, shown alone while the filter is unset and as a prefix once it has a value. */
  label: string;
  /** "" means "no filter applied". Any other value is considered active. */
  value: string;
  onChange: (value: string) => void;
  /**
   * "select" (default) opens a popover listing `options`, single-select.
   * "boolean" turns the pill itself into a direct on/off toggle -- no
   * popover -- for a filter with exactly one meaningful "on" state (e.g.
   * "Hanya tersedia").
   */
  type?: "select" | "boolean";
  /** Required for type="select": the choices offered in the popover. */
  options?: DataTableFilterOption[];
  /** type="boolean" only: the value written when the toggle turns on. Defaults to "true". */
  activeValue?: string;
}

export interface DataTableFiltersLabels {
  /** Clears every active filter at once; only rendered while at least one is active. */
  reset: string;
  /** Accessible name for one filter chip's remove control, e.g. "Hapus filter {label}". */
  removeFilter: (label: string) => string;
}

export const DEFAULT_DATA_TABLE_FILTERS_LABELS: DataTableFiltersLabels = {
  reset: "Reset filter",
  removeFilter: (label) => `Hapus filter ${label}`,
};

export interface DataTableFiltersProps {
  filters: DataTableFilterDef[];
  labels?: Partial<DataTableFiltersLabels>;
  className?: string;
}

/**
 * A row of filter pills next to a `DataTable`'s search box (rendered by
 * `DataTableToolbar` when the `filters` prop is passed to `DataTable`). Each
 * pill is its own trigger; once it has a value it grows a remove control and
 * doubles as that filter's "active" chip, so there is no separate summary
 * row to keep in sync. See docs/05-shared-components.md.
 */
export function DataTableFilters({
  filters,
  labels: labelsOverride,
  className,
}: DataTableFiltersProps): ReactElement {
  const labels = { ...DEFAULT_DATA_TABLE_FILTERS_LABELS, ...labelsOverride };
  const hasActiveFilter = filters.some((filter) => filter.value !== "");

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {filters.map((filter) => (
        <DataTableFilterPill
          key={filter.id}
          filter={filter}
          removeLabel={labels.removeFilter(filter.label)}
        />
      ))}
      {hasActiveFilter && (
        <button
          type="button"
          className="h-8 shrink-0 rounded-full px-2 text-[13px] font-medium text-accent hover:underline"
          onClick={() => {
            for (const filter of filters) {
              if (filter.value !== "") filter.onChange("");
            }
          }}
        >
          {labels.reset}
        </button>
      )}
    </div>
  );
}

const PILL_TRIGGER_CLASS =
  "flex h-11 md:h-8 items-center gap-1 px-3 text-[13px] font-medium outline-none";

function DataTableFilterPill({
  filter,
  removeLabel,
}: {
  filter: DataTableFilterDef;
  removeLabel: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const active = filter.value !== "";
  const activeOptionLabel = filter.options?.find((option) => option.value === filter.value)?.label;
  const triggerLabel = active
    ? `${filter.label}: ${activeOptionLabel ?? filter.value}`
    : filter.label;

  const shell = (trigger: ReactElement) => (
    <div
      className={cn(
        "inline-flex items-center overflow-hidden rounded-full border",
        active
          ? "border-accent bg-accent-soft text-accent-soft-fg"
          : "border-border bg-surface text-fg",
      )}
    >
      {trigger}
      {active && (
        <button
          type="button"
          aria-label={removeLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center md:h-8 md:w-8"
          onClick={() => {
            filter.onChange("");
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  if (filter.type === "boolean") {
    const activeValue = filter.activeValue ?? "true";
    return shell(
      <button
        type="button"
        aria-pressed={active}
        className={cn(PILL_TRIGGER_CLASS, active ? "text-accent-soft-fg" : "text-fg hover:bg-bg")}
        onClick={() => {
          filter.onChange(active ? "" : activeValue);
        }}
      >
        {filter.label}
      </button>,
    );
  }

  return shell(
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(PILL_TRIGGER_CLASS, active ? "text-accent-soft-fg" : "text-fg hover:bg-bg")}
        >
          {triggerLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="flex flex-col gap-0.5">
          {(filter.options ?? []).map((option) => (
            <button
              key={option.value}
              type="button"
              className="flex h-11 md:h-9 items-center justify-between rounded-xs px-2 text-left text-[13px] text-fg outline-none hover:bg-bg"
              onClick={() => {
                filter.onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {filter.value === option.value && (
                <Check className="size-4 text-accent" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>,
  );
}
