"use client";

import { Check } from "lucide-react";
import { useRef, useState, type ReactElement, type RefObject } from "react";

import { useScrollEdges } from "../../hooks/use-scroll-edges.js";
import { cn } from "../../utils/cn.js";
import { DatePicker } from "../date-picker.js";
import { Field, FieldError } from "../field.js";
import { ResponsivePopover } from "../responsive-popover.js";
import { useUiLabels } from "../ui-labels.js";

import { formatDateRange } from "./data-table-date-range-format.js";
import {
  FilterPillShell,
  PILL_MENU_TRIGGER_CLASS,
  PILL_TRIGGER_CLASS,
  PillChevron,
} from "./data-table-filter-pill.js";
import { MonthFilterPill } from "./data-table-month-filter.js";

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
   * Used by "select", "boolean" (the default) and "month" ("YYYY-MM");
   * ignored for "dateRange", which reads `from`/`to` instead.
   */
  value?: string;
  /** Used by "select", "boolean" and "month"; ignored for "dateRange". */
  onChange?: (value: string) => void;
  /**
   * "select" (default) opens a popover listing `options`, single-select.
   * "boolean" turns the pill itself into a direct on/off toggle -- no
   * popover -- for a filter with exactly one meaningful "on" state (e.g.
   * "Hanya tersedia").
   * "dateRange" opens a popover with two `DatePicker` fields (from/to),
   * which show the date in the page's language ("14 November 2026"), plus
   * any `presets`.
   * "month" opens the month grid of `MonthPicker` (a billing period, a
   * monthly report) and writes "YYYY-MM"; the chip reads "Periode:
   * November 2026".
   */
  type?: "select" | "boolean" | "dateRange" | "month";
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
  /**
   * type="dateRange" only: the page's own period ("YYYY-MM-DD", or "" for
   * an open bound), e.g. the month so far. At these bounds the range is
   * not a filter the reader applied: its pill shows the period in the
   * neutral style with no remove control, and Reset leaves it alone.
   * Removing or resetting a changed range comes back to them.
   */
  defaultFrom?: string;
  /** type="dateRange" only: see `defaultFrom`. */
  defaultTo?: string;
  /** type="month" only: the earliest month offered, "YYYY-MM". */
  minMonth?: string;
  /** type="month" only: the latest month offered, "YYYY-MM". */
  maxMonth?: string;
  /**
   * type="month" and "dateRange": the school's "today", "YYYY-MM-DD", so
   * the month grid and the date calendars mark today from the business
   * clock, not the device's.
   */
  today?: string;
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
  /** type="dateRange": the pill's value for a range with only a start, e.g. "sejak 19 Nov 2026". */
  dateRangeSince: (date: string) => string;
  /** type="dateRange": the pill's value for a range with only an end, e.g. "sampai 10 Nov 2026". */
  dateRangeUntil: (date: string) => string;
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
  reset: "Hapus semua filter",
  removeFilter: (label) => `Hapus filter ${label}`,
  dateRangeFrom: "Dari",
  dateRangeTo: "Sampai",
  dateRangeInvalid: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir",
  dateRangeSince: (date) => `sejak ${date}`,
  dateRangeUntil: (date) => `sampai ${date}`,
};

export interface DataTableFiltersProps {
  filters: DataTableFilterDef[];
  labels?: Partial<DataTableFiltersLabels>;
  className?: string;
  /**
   * Where focus goes when "Hapus semua filter", pressed from the keyboard,
   * takes itself away (the table's search box, which `DataTableToolbar`
   * passes). Without it, while it is not on the page, or after a tap,
   * focus goes to the first filter pill.
   */
  resetFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Whether the reader has narrowed the rows with this filter (the toolbar's
 * view options read it too). A date range at the page's own default
 * period is not; without `defaultFrom`/`defaultTo` that is an open range.
 */
export function isFilterActive(filter: DataTableFilterDef): boolean {
  if (filter.type === "dateRange") {
    return (
      (filter.from ?? "") !== (filter.defaultFrom ?? "") ||
      (filter.to ?? "") !== (filter.defaultTo ?? "")
    );
  }
  return (filter.value ?? "") !== "";
}

/** Back to unfiltered: no value, or a date range's default period. */
function clearFilter(filter: DataTableFilterDef): void {
  if (filter.type === "dateRange") {
    filter.onChangeRange?.({ from: filter.defaultFrom ?? "", to: filter.defaultTo ?? "" });
  } else {
    filter.onChange?.("");
  }
}

/**
 * Moves focus, before a reset takes its own button away, to a control of
 * the toolbar that stays, so it does not drop to <body> and the next Tab
 * back to the top: from the keyboard (a click with no pointer count,
 * `detail` 0) the search box; from a tap or a click, or with no search
 * box, the first filter pill (always rendered, active or not), which
 * raises no phone keyboard.
 */
export function focusAfterReset(
  detail: number,
  search: HTMLElement | null | undefined,
  pills: HTMLElement | null | undefined,
): void {
  const target =
    detail === 0 && search?.isConnected ? search : pills?.querySelector<HTMLElement>("button");
  target?.focus();
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
  resetFocusRef,
}: DataTableFiltersProps): ReactElement {
  const uiLabels = useUiLabels();
  const labels: DataTableFiltersLabels = {
    reset: uiLabels.tableFiltersReset,
    removeFilter: uiLabels.tableFilterRemove,
    dateRangeFrom: uiLabels.tableFilterDateFrom,
    dateRangeTo: uiLabels.tableFilterDateTo,
    dateRangeInvalid: uiLabels.tableFilterDateInvalid,
    dateRangeSince: uiLabels.tableFilterDateSince,
    dateRangeUntil: uiLabels.tableFilterDateUntil,
    ...labelsOverride,
  };
  const hasActiveFilter = filters.some(isFilterActive);
  const scrollerRef = useRef<HTMLDivElement>(null);
  useScrollEdges(scrollerRef, { axis: "x" });

  return (
    // One row that scrolls sideways on a phone (wrapped pills would push the
    // list below the fold), wrapping from `md` up. The 4px vertical padding
    // keeps the pills' focus rings inside the scroller's clip.
    <div
      ref={scrollerRef}
      data-slot="data-table-filters"
      className={cn(
        "-my-1 flex scrollbar-none items-center gap-1.5 overflow-x-auto py-1 [&>*]:shrink-0",
        // An edge with more pills past it fades out, as a tab strip's does,
        // so a pill cut by the edge reads as "more this way"; a row that
        // fits (and the wrapped row from md up) has no fade at all.
        "scroll-fade-x md:flex-wrap md:overflow-visible",
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
            sinceLabel={labels.dateRangeSince}
            untilLabel={labels.dateRangeUntil}
          />
        ) : filter.type === "month" ? (
          <MonthFilterPill
            key={filter.id}
            filter={filter}
            removeLabel={labels.removeFilter(filter.label)}
            locale={uiLabels.locale}
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
          onClick={(event) => {
            // The button leaves the page once nothing is filtered, which
            // would drop focus to <body> and the next Tab back to the top.
            focusAfterReset(event.detail, resetFocusRef?.current, scrollerRef.current);
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
        // A sheet on a phone: a long list from a pill would otherwise hang
        // down into the tab bar.
        <ResponsivePopover
          open={open}
          onOpenChange={setOpen}
          title={filter.label}
          align="start"
          className="w-56 p-1"
          trigger={
            <button
              type="button"
              className={cn(
                PILL_MENU_TRIGGER_CLASS,
                active
                  ? "text-accent-soft-fg hover:bg-state-hover"
                  : "text-fg hover:bg-state-hover",
              )}
            >
              {triggerLabel}
              <PillChevron active={active} />
            </button>
          }
        >
          {/* In the sheet the rows run out to 8px from its edges, their text
              lined up with the title's. */}
          <div className="flex flex-col gap-0.5 max-sm:-mx-3">
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
        </ResponsivePopover>
      }
    />
  );
}

function DateRangeFilterPill({
  filter,
  removeLabel,
  fromLabel,
  toLabel,
  invalidLabel,
  sinceLabel,
  untilLabel,
}: {
  filter: DataTableFilterDef;
  removeLabel: string;
  fromLabel: string;
  toLabel: string;
  invalidLabel: string;
  sinceLabel: (date: string) => string;
  untilLabel: (date: string) => string;
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

  // A page's default period still reads out on the pill, in the neutral
  // style: it says which days are shown without claiming a filter is on.
  const hasRange = Boolean(committedFrom) || Boolean(committedTo);
  const active = isFilterActive(filter);
  const invalid = draftFrom !== "" && draftTo !== "" && draftFrom > draftTo;
  const triggerLabel = hasRange
    ? `${filter.label}: ${formatDateRange(committedFrom, committedTo, sinceLabel, untilLabel)}`
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
      onRemove={() => {
        clearFilter(filter);
      }}
      trigger={
        <ResponsivePopover
          open={open}
          onOpenChange={handleOpenChange}
          title={filter.label}
          align="start"
          className="w-80 p-3"
          trigger={
            <button
              type="button"
              className={cn(
                PILL_MENU_TRIGGER_CLASS,
                active
                  ? "text-accent-soft-fg hover:bg-state-hover"
                  : "text-fg hover:bg-state-hover",
              )}
            >
              {triggerLabel}
              <PillChevron active={active} />
            </button>
          }
        >
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
            {/* Stacked: a long date ("14 November 2026") with its clear
                button does not fit two to a row in the 320px popover. */}
            <div className="flex flex-col gap-3">
              <Field label={fromLabel}>
                <DatePicker
                  value={draftFrom}
                  today={filter.today}
                  invalid={invalid}
                  onChange={(next) => {
                    commit(next, draftTo);
                  }}
                />
              </Field>
              <Field label={toLabel}>
                <DatePicker
                  value={draftTo}
                  today={filter.today}
                  invalid={invalid}
                  onChange={(next) => {
                    commit(draftFrom, next);
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
        </ResponsivePopover>
      }
    />
  );
}
