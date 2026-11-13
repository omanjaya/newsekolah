"use client";

import { CalendarDays } from "lucide-react";
import { forwardRef, useId, useState } from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
import { useLocalToday } from "../hooks/use-local-today.js";
import { cn } from "../utils/cn.js";
import {
  formatIsoMonth,
  isoMonthOf,
  localTodayIso,
  normalizeIsoDate,
  normalizeIsoMonth,
  parseIsoMonth,
} from "../utils/iso-date.js";

import { CalendarMonthGrid } from "./calendar-month-grid.js";
import {
  focusPickerGrid,
  keepEscapeForCalendarView,
  PICKER_POPOVER,
  PickerField,
  type PickerFieldAriaProps,
} from "./picker-field.js";
import { Popover, PopoverContent } from "./popover.js";
import { useUiLabels } from "./ui-labels.js";

export interface MonthPickerProps extends PickerFieldAriaProps {
  /** "YYYY-MM", or ""/null for none. */
  value?: string | null;
  defaultValue?: string;
  /** Called with "YYYY-MM", or "" when cleared (what `<input type="month">` gives). */
  onChange?: (value: string) => void;
  /** Earliest selectable month, "YYYY-MM". */
  min?: string;
  /** Latest selectable month, "YYYY-MM". */
  max?: string;
  /** The school's "today", "YYYY-MM-DD"; marks the current month. */
  today?: string;
  locale?: string;
  placeholder?: string;
  required?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
  onBlur?: () => void;
  align?: "start" | "center" | "end";
  className?: string;
}

/** A month field ("November 2026") for monthly reports and billing periods; value "YYYY-MM". */
export const MonthPicker = forwardRef<HTMLButtonElement, MonthPickerProps>(function MonthPicker(
  {
    value: valueProp,
    defaultValue = "",
    onChange,
    min: minProp,
    max: maxProp,
    today: todayProp,
    locale: localeProp,
    placeholder,
    required,
    clearable,
    name,
    align = "start",
    ...field
  },
  ref,
) {
  const labels = useUiLabels();
  const locale = localeProp ?? labels.locale;
  const localToday = useLocalToday();
  const today = normalizeIsoDate(todayProp) ?? localToday;
  const min = normalizeIsoMonth(minProp);
  const max = normalizeIsoMonth(maxProp);
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const [rawValue, setValue] = useControllableState(
    valueProp === null ? "" : valueProp,
    defaultValue,
    onChange,
  );
  const value = parseIsoMonth(rawValue) ? rawValue : "";
  const currentMonth = today ? isoMonthOf(today) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PickerField
        ref={ref}
        open={open}
        contentId={contentId}
        icon={<CalendarDays />}
        text={value ? formatIsoMonth(value, locale) : ""}
        placeholder={placeholder ?? labels.monthPickerPlaceholder}
        required={required}
        clearLabel={labels.monthPickerClear}
        onClear={
          (clearable ?? !required) && value
            ? () => {
                setValue("");
              }
            : undefined
        }
        onOpen={() => {
          setOpen(true);
        }}
        hiddenInputs={name ? [{ name, value }] : undefined}
        {...field}
      />
      <PopoverContent
        id={contentId}
        align={align}
        aria-label={placeholder ?? labels.monthPickerPlaceholder}
        collisionPadding={16}
        className={cn(PICKER_POPOVER, "w-72")}
        onOpenAutoFocus={focusPickerGrid}
        onEscapeKeyDown={keepEscapeForCalendarView}
      >
        <CalendarMonthGrid
          value={value}
          initialFocus={value || currentMonth || isoMonthOf(localTodayIso())}
          currentMonth={currentMonth}
          min={min}
          max={max}
          locale={locale}
          onSelect={(month) => {
            setValue(month);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
});
