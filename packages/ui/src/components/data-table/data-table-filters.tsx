"use client";

import { Check, X } from "lucide-react";
import { useState, type ReactElement } from "react";

import { cn } from "../../utils/cn.js";
import { Field, FieldError } from "../field.js";
import { Input } from "../input.js";
import { Popover, PopoverContent, PopoverTrigger } from "../popover.js";
import { useUiLabels } from "../ui-labels.js";

export interface DataTableFilterOption {
  value: string;
  label: string;
}

/**
 * A caller-computed quick pick for a "dateRange" filter, e.g. "7 hari
 * terakhir". `from`/`to` are "YYYY-MM-DD", inclusive. This component never
 * computes "today" itself -- the caller derives it (from the business clock
 * in apps/web, so simulated time is honoured) and passes the result here.
 */
export interface DataTableDateRangePreset {
  label: string;
  from: string;
  to: string;
}

export interface DataTableFilterDef {
  /** Stable key for the filter, e.g. "material_type" -- not shown to the user. */
  id: string;
  /** Visible label, shown alone while the filter is unset and as a prefix once it has a value. */
  label: string;
  /**
   * "" means "no filter applied". Any other value is considered active.
   * Used by "select" and "boolean" (the default); ignored for "dateRange",
   * which reads `from`/`to` instead.
   */
  value?: string;
  /** Used by "select" and "boolean"; ignored for "dateRange". */
  onChange?: (value: string) => void;
  /**
   * "select" (default) opens a popover listing `options`, single-select.
   * "boolean" turns the pill itself into a direct on/off toggle -- no
   * popover -- for a filter with exactly one meaningful "on" state (e.g.
   * "Hanya tersedia").
   * "dateRange" opens a popover with two native date inputs (from/to) plus
   * any `presets`.
   */
  type?: "select" | "boolean" | "dateRange";
  /** Required for type="select": the choices offered in the popover. */
  options?: DataTableFilterOption[];
  /** type="boolean" only: the value written when the toggle turns on. Defaults to "true". */
  activeValue?: string;
  /** type="dateRange" only: "YYYY-MM-DD", or "" when that bound is unset. */
  from?: string;
  /** type="dateRange" only: "YYYY-MM-DD", or "" when that bound is unset. */
  to?: string;
  /**
   * type="dateRange" only: called with the next bounds once both are valid
   * (from <= to) or either/both are cleared to "". Never called with an
   * invalid pairing -- the popover shows a validation message instead.
   */
  onChangeRange?: (range: { from: string; to: string }) => void;
  /** type="dateRange" only: quick picks shown above the two date inputs. */
  presets?: DataTableDateRangePreset[];
}

export interface DataTableFiltersLabels {
  /** Clears every active filter at once; only rendered while at least one is active. */
  reset: string;
  /** Accessible name for one filter chip's remove control, e.g. "Hapus filter {label}". */
  removeFilter: (label: string) => string;
  /** type="dateRange": label above the "from" date input. */
  dateRangeFrom: string;
  /** type="dateRange": label above the "to" date input. */
  dateRangeTo: string;
  /** type="dateRange": shown when "from" is after "to". */
  dateRangeInvalid: string;
}

/**
 * Legacy: the defaults now come from `UiLabels` (`tableFiltersReset`,
 * `tableFilterRemove`...), so a locale provider translates them; this
 * constant only keeps the package's old public export working, and
 * nothing in the package or apps/web reads it.
 *
 * Deprecated: use `UiLabelsProvider` (or the `labels` prop) instead. To be
 * removed with the next breaking release of the package, by 2027-01-31.
 * (Not tagged `@deprecated`: the package index still re-exports it, which
 * the lint rule against deprecated symbols would refuse.)
 */
export const DEFAULT_DATA_TABLE_FILTERS_LABELS: DataTableFiltersLabels = {
  reset: "Reset filter",
  removeFilter: (label) => `Hapus filter ${label}`,
  dateRangeFrom: "Dari",
  dateRangeTo: "Sampai",
  dateRangeInvalid: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir",
};

export interface DataTableFiltersProps {
  filters: DataTableFilterDef[];
  labels?: Partial<DataTableFiltersLabels>;
  className?: string;
}

function isFilterActive(filter: DataTableFilterDef): boolean {
  if (filter.type === "dateRange") return Boolean(filter.from) || Boolean(filter.to);
  return (filter.value ?? "") !== "";
}

function clearFilter(filter: DataTableFilterDef): void {
  if (filter.type === "dateRange") {
    filter.onChangeRange?.({ from: "", to: "" });
  } else {
    filter.onChange?.("");
  }
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
  const uiLabels = useUiLabels();
  const labels: DataTableFiltersLabels = {
    reset: uiLabels.tableFiltersReset,
    removeFilter: uiLabels.tableFilterRemove,
    dateRangeFrom: uiLabels.tableFilterDateFrom,
    dateRangeTo: uiLabels.tableFilterDateTo,
    dateRangeInvalid: uiLabels.tableFilterDateInvalid,
    ...labelsOverride,
  };
  const hasActiveFilter = filters.some(isFilterActive);

  return (
    // One row that scrolls sideways on a phone (wrapped pills would push the
    // list below the fold), wrapping from `md` up. The 4px vertical padding
    // keeps the pills' focus rings inside the scroller's clip.
    <div
      className={cn(
        "-my-1 flex scrollbar-none items-center gap-1.5 overflow-x-auto py-1 [&>*]:shrink-0",
        // The last 24px fade out, so a pill cut by the edge reads as "more this way".
        "max-md:mask-r-from-[calc(100%-1.5rem)] md:flex-wrap md:overflow-visible",
        className,
      )}
    >
      {filters.map((filter) =>
        filter.type === "dateRange" ? (
          <DateRangeFilterPill
            key={filter.id}
            filter={filter}
            removeLabel={labels.removeFilter(filter.label)}
            fromLabel={labels.dateRangeFrom}
            toLabel={labels.dateRangeTo}
            invalidLabel={labels.dateRangeInvalid}
          />
        ) : (
          <DataTableFilterPill
            key={filter.id}
            filter={filter}
            removeLabel={labels.removeFilter(filter.label)}
          />
        ),
      )}
      {hasActiveFilter && (
        <button
          type="button"
          className="h-11 shrink-0 rounded-full px-3 text-label text-accent transition-colors hover:bg-state-hover md:pointer-fine:h-8"
          onClick={() => {
            for (const filter of filters) {
              if (isFilterActive(filter)) clearFilter(filter);
            }
          }}
        >
          {labels.reset}
        </button>
      )}
    </div>
  );
}

// Each half of a pill is rounded itself, rather than clipped by an
// `overflow-hidden` shell: clipping would also cut off the keyboard focus
// ring the base styles draw around whichever half has focus.
const PILL_TRIGGER_CLASS =
  "flex h-11 items-center gap-1 rounded-full px-3 text-label whitespace-nowrap transition-colors md:pointer-fine:h-8";

function FilterPillShell({
  active,
  removeLabel,
  onRemove,
  trigger,
}: {
  active: boolean;
  removeLabel: string;
  onRemove: () => void;
  trigger: ReactElement;
}): ReactElement {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border",
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
          className="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-state-hover active:bg-state-pressed md:pointer-fine:size-8"
          onClick={onRemove}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function DataTableFilterPill({
  filter,
  removeLabel,
}: {
  filter: DataTableFilterDef;
  removeLabel: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const active = (filter.value ?? "") !== "";
  const activeOptionLabel = filter.options?.find((option) => option.value === filter.value)?.label;
  const triggerLabel = active
    ? `${filter.label}: ${activeOptionLabel ?? filter.value}`
    : filter.label;

  if (filter.type === "boolean") {
    const activeValue = filter.activeValue ?? "true";
    return (
      <FilterPillShell
        active={active}
        removeLabel={removeLabel}
        onRemove={() => filter.onChange?.("")}
        trigger={
          <button
            type="button"
            aria-pressed={active}
            className={cn(
              PILL_TRIGGER_CLASS,
              active ? "text-accent-soft-fg hover:bg-state-hover" : "text-fg hover:bg-state-hover",
            )}
            onClick={() => {
              filter.onChange?.(active ? "" : activeValue);
            }}
          >
            {filter.label}
          </button>
        }
      />
    );
  }

  return (
    <FilterPillShell
      active={active}
      removeLabel={removeLabel}
      onRemove={() => filter.onChange?.("")}
      trigger={
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                PILL_TRIGGER_CLASS,
                active
                  ? "text-accent-soft-fg hover:bg-state-hover"
                  : "text-fg hover:bg-state-hover",
              )}
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
                  className="flex min-h-11 items-center justify-between gap-2 rounded-sm px-3 text-left text-body text-fg transition-colors hover:bg-state-hover focus-visible:bg-state-hover focus-visible:-outline-offset-2 md:pointer-fine:min-h-9"
                  onClick={() => {
                    filter.onChange?.(option.value);
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
        </Popover>
      }
    />
  );
}

/**
 * "YYYY-MM-DD" -> "6 Sep" / "6 Sep 2026". The month name comes from `Intl`
 * in the page's language (so it is never a hardcoded locale's spelling), but the
 * day-month-year order is fixed here rather than left to a full `Intl`
 * format, which in several locales would reorder it (e.g. "Sep 6, 2026").
 */
function formatDayMonth(value: string, withYear: boolean): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  // The page's own language (set by the app on <html lang>), not the
  // browser's, so an English-language browser still reads "Okt" on an
  // Indonesian page.
  const locale =
    typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined;
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(date);
  return withYear
    ? `${date.getDate()} ${month} ${date.getFullYear()}`
    : `${date.getDate()} ${month}`;
}

function formatDateRange(from: string, to: string): string {
  if (from && to) {
    if (from === to) return formatDayMonth(from, true);
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T00:00:00`);
    const sameYear = fromDate.getFullYear() === toDate.getFullYear();
    const sameMonth = sameYear && fromDate.getMonth() === toDate.getMonth();
    if (sameMonth) return `${fromDate.getDate()}-${formatDayMonth(to, true)}`;
    return `${formatDayMonth(from, !sameYear)} - ${formatDayMonth(to, true)}`;
  }
  if (from) return formatDayMonth(from, true);
  return formatDayMonth(to, true);
}

function DateRangeFilterPill({
  filter,
  removeLabel,
  fromLabel,
  toLabel,
  invalidLabel,
}: {
  filter: DataTableFilterDef;
  removeLabel: string;
  fromLabel: string;
  toLabel: string;
  invalidLabel: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const committedFrom = filter.from ?? "";
  const committedTo = filter.to ?? "";
  const [draftFrom, setDraftFrom] = useState(committedFrom);
  const [draftTo, setDraftTo] = useState(committedTo);

  // The popover can reopen long after the filter changed elsewhere (e.g. the
  // bar's own Reset), so each opening starts the draft fresh from the
  // committed value rather than syncing on every render.
  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftFrom(committedFrom);
      setDraftTo(committedTo);
    }
    setOpen(next);
  }

  const active = Boolean(committedFrom) || Boolean(committedTo);
  const invalid = draftFrom !== "" && draftTo !== "" && draftFrom > draftTo;
  const triggerLabel = active
    ? `${filter.label}: ${formatDateRange(committedFrom, committedTo)}`
    : filter.label;

  function commit(nextFrom: string, nextTo: string) {
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    if (nextFrom !== "" && nextTo !== "" && nextFrom > nextTo) return;
    filter.onChangeRange?.({ from: nextFrom, to: nextTo });
  }

  return (
    <FilterPillShell
      active={active}
      removeLabel={removeLabel}
      onRemove={() => filter.onChangeRange?.({ from: "", to: "" })}
      trigger={
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                PILL_TRIGGER_CLASS,
                active
                  ? "text-accent-soft-fg hover:bg-state-hover"
                  : "text-fg hover:bg-state-hover",
              )}
            >
              {triggerLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3">
            <div className="flex flex-col gap-3">
              {filter.presets && filter.presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {filter.presets.map((preset) => {
                    const presetActive = preset.from === draftFrom && preset.to === draftTo;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className={cn(
                          "flex h-11 items-center gap-1 rounded-full border px-3 text-label md:pointer-fine:h-8",
                          "transition-[color,background-color,border-color,box-shadow]",
                          // Its own surface stays under the hover layer (state-layer).
                          presetActive
                            ? "border-accent bg-accent-soft text-accent-soft-fg"
                            : "border-border bg-surface text-fg state-layer",
                        )}
                        onClick={() => {
                          commit(preset.from, preset.to);
                          setOpen(false);
                        }}
                      >
                        {presetActive && <Check className="size-3.5" aria-hidden="true" />}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label={fromLabel}>
                  <Input
                    type="date"
                    size="sm"
                    value={draftFrom}
                    invalid={invalid}
                    onChange={(event) => {
                      commit(event.target.value, draftTo);
                    }}
                  />
                </Field>
                <Field label={toLabel}>
                  <Input
                    type="date"
                    size="sm"
                    value={draftTo}
                    invalid={invalid}
                    onChange={(event) => {
                      commit(draftFrom, event.target.value);
                    }}
                  />
                </Field>
              </div>
              {invalid && (
                <div role="alert">
                  <FieldError>{invalidLabel}</FieldError>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      }
    />
  );
}
