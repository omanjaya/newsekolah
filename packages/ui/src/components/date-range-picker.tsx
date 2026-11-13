"use client";

import { CalendarRange } from "lucide-react";
import { forwardRef, useId, useState, type ReactElement } from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
import { cn } from "../utils/cn.js";
import { formatIsoDateRange, isIsoDate } from "../utils/iso-date.js";

import { Calendar, type DateRange } from "./calendar.js";
import {
  focusPickerGrid,
  keepEscapeForCalendarView,
  PICKER_POPOVER,
  PickerField,
  type PickerFieldAriaProps,
} from "./picker-field.js";
import { Popover, PopoverContent } from "./popover.js";
import { useUiLabels } from "./ui-labels.js";

/**
 * A caller-computed quick pick ("7 hari terakhir"), inclusive ISO dates.
 * The caller derives it from the business clock, the same shape as
 * `DataTableDateRangePreset`.
 */
export interface DateRangePreset {
  label: string;
  from: string;
  to: string;
}

export interface DateRangePickerProps extends PickerFieldAriaProps {
  /** Both ends "YYYY-MM-DD"; `{ from: "", to: "" }` (or null) for none. */
  value?: DateRange | null;
  defaultValue?: DateRange;
  /** Called once a range is complete (ordered, from <= to), or with two "" when cleared. */
  onChange?: (value: DateRange) => void;
  presets?: DateRangePreset[];
  min?: string;
  max?: string;
  isDateDisabled?: (date: string) => boolean;
  today?: string;
  locale?: string;
  /** Per-end format, collapsed by the locale: default "1–14 Nov 2026". */
  formatOptions?: Intl.DateTimeFormatOptions;
  placeholder?: string;
  required?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Hidden-input names for a native form post. */
  fromName?: string;
  toName?: string;
  onBlur?: () => void;
  align?: "start" | "center" | "end";
  className?: string;
}

const EMPTY: DateRange = { from: "", to: "" };
const SHORT_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

function completeRange(range: DateRange | null | undefined): DateRange {
  if (!range || !isIsoDate(range.from) || !isIsoDate(range.to)) return EMPTY;
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

/**
 * Two dates chosen on one calendar: the first click starts the range, the
 * second ends it (in either order) and closes the popover. Presets sit
 * beside the calendar on a wide screen and above it on a phone. Partial
 * picks stay inside the popover; `onChange` only ever sees a full range.
 */
export const DateRangePicker = forwardRef<HTMLButtonElement, DateRangePickerProps>(
  function DateRangePicker(
    {
      value: valueProp,
      defaultValue = EMPTY,
      onChange,
      presets,
      min,
      max,
      isDateDisabled,
      today,
      locale: localeProp,
      formatOptions = SHORT_DATE,
      placeholder,
      required,
      clearable,
      fromName,
      toName,
      align = "start",
      ...field
    },
    ref,
  ) {
    const labels = useUiLabels();
    const locale = localeProp ?? labels.locale;
    const contentId = useId();
    const [open, setOpen] = useState(false);
    const [rawValue, setValue] = useControllableState(
      valueProp === null ? EMPTY : valueProp,
      defaultValue,
      onChange,
    );
    const value = completeRange(rawValue);
    const [draft, setDraft] = useState<DateRange>(value);
    const hasValue = value.from !== "";

    function openWith(nextOpen: boolean) {
      if (nextOpen) setDraft(value);
      setOpen(nextOpen);
    }

    function commit(range: DateRange) {
      setValue(range);
      setOpen(false);
    }

    const hiddenInputs = [
      ...(fromName ? [{ name: fromName, value: value.from }] : []),
      ...(toName ? [{ name: toName, value: value.to }] : []),
    ];

    return (
      <Popover open={open} onOpenChange={openWith}>
        <PickerField
          ref={ref}
          open={open}
          contentId={contentId}
          icon={<CalendarRange />}
          text={hasValue ? formatIsoDateRange(value.from, value.to, locale, formatOptions) : ""}
          placeholder={placeholder ?? labels.dateRangePickerPlaceholder}
          required={required}
          clearLabel={labels.dateRangePickerClear}
          onClear={
            (clearable ?? !required) && hasValue
              ? () => {
                  setValue(EMPTY);
                }
              : undefined
          }
          onOpen={() => {
            openWith(true);
          }}
          hiddenInputs={hiddenInputs}
          {...field}
        />
        <PopoverContent
          id={contentId}
          align={align}
          aria-label={placeholder ?? labels.dateRangePickerPlaceholder}
          // 16px from the screen edges on a phone, where the range picker
          // (presets above the calendar) is nearly as wide as the screen.
          collisionPadding={16}
          className={cn(PICKER_POPOVER, "w-auto max-w-[calc(100vw-2rem)]")}
          onOpenAutoFocus={focusPickerGrid}
          onEscapeKeyDown={keepEscapeForCalendarView}
        >
          <div className="flex flex-col gap-3 md:flex-row">
            {presets && presets.length > 0 && (
              <PresetList
                presets={presets}
                value={value}
                label={labels.dateRangePickerPresets}
                onPick={(preset) => {
                  commit({ from: preset.from, to: preset.to });
                }}
              />
            )}
            <div className="flex flex-col gap-1">
              <p aria-live="polite" className="px-3 text-caption text-fg-muted">
                {draft.from && !draft.to
                  ? labels.dateRangePickerPickEnd
                  : labels.dateRangePickerPickStart}
              </p>
              <Calendar
                mode="range"
                value={draft}
                onChange={(next) => {
                  setDraft(next);
                  if (next.to) commit(next);
                }}
                min={min}
                max={max}
                isDateDisabled={isDateDisabled}
                today={today}
                locale={locale}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);

function PresetList({
  presets,
  value,
  label,
  onPick,
}: {
  presets: DateRangePreset[];
  value: DateRange;
  label: string;
  onPick: (preset: DateRangePreset) => void;
}): ReactElement {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex flex-wrap gap-1.5",
        "md:w-40 md:flex-col md:flex-nowrap md:gap-0.5 md:border-r md:border-border md:pr-3",
      )}
    >
      {presets.map((preset) => {
        const active = preset.from === value.from && preset.to === value.to;
        return (
          <button
            key={preset.label}
            type="button"
            aria-pressed={active}
            className={cn(
              "inline-flex h-11 items-center rounded-full border border-border px-3 text-label text-fg",
              "md:w-full md:rounded-md md:border-transparent md:px-2.5 md:text-left md:pointer-fine:h-9",
              "transition-colors",
              active
                ? "border-accent-soft bg-accent-soft font-medium text-accent-soft-fg"
                : "hover:bg-state-hover",
            )}
            onClick={() => {
              onPick(preset);
            }}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
