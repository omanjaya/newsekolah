"use client";

import { CalendarDays } from "lucide-react";
import { forwardRef, useId, useState, type ReactNode } from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
import { formatIsoDate, isIsoDate, LONG_DATE } from "../utils/iso-date.js";

import { Calendar, type CalendarDayInfo } from "./calendar.js";
import { PickerField, type PickerFieldAriaProps } from "./picker-field.js";
import { Popover, PopoverContent } from "./popover.js";
import { useUiLabels } from "./ui-labels.js";

export interface DatePickerProps extends PickerFieldAriaProps {
  /** "YYYY-MM-DD", or ""/null for none. */
  value?: string | null;
  defaultValue?: string;
  /** Called with "YYYY-MM-DD", or "" when cleared (what an emptied native date input gives). */
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  isDateDisabled?: (date: string) => boolean;
  /** The school's "today", "YYYY-MM-DD"; see `Calendar`. */
  today?: string;
  locale?: string;
  /** How the field shows the date; default "14 November 2026". */
  formatOptions?: Intl.DateTimeFormatOptions;
  placeholder?: string;
  /** Marks the field required and, unless `clearable` says otherwise, hides the clear button. */
  required?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Renders a hidden input so a native form post carries the value. */
  name?: string;
  onBlur?: () => void;
  renderDay?: (day: CalendarDayInfo) => ReactNode;
  getDayDescription?: (date: string) => string | undefined;
  align?: "start" | "center" | "end";
  /** Sizes the field (it fills its container by default). */
  className?: string;
}

/**
 * A date field: shows the formatted date and opens a `Calendar` in a
 * popover. The value is an ISO "YYYY-MM-DD" string, the same the forms and
 * the API use, so it drops in where `<Input type="date">` was. The ref is
 * the trigger button, which react-hook-form focuses on a validation error.
 */
export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(function DatePicker(
  {
    value: valueProp,
    defaultValue = "",
    onChange,
    min,
    max,
    isDateDisabled,
    today,
    locale: localeProp,
    formatOptions = LONG_DATE,
    placeholder,
    required,
    clearable,
    name,
    renderDay,
    getDayDescription,
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
    valueProp === null ? "" : valueProp,
    defaultValue,
    onChange,
  );
  const value = isIsoDate(rawValue) ? rawValue : "";
  const canClear = (clearable ?? !required) && value !== "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PickerField
        ref={ref}
        open={open}
        contentId={contentId}
        icon={<CalendarDays />}
        text={value ? formatIsoDate(value, locale, formatOptions) : ""}
        placeholder={placeholder ?? labels.datePickerPlaceholder}
        required={required}
        clearLabel={labels.datePickerClear}
        onClear={
          canClear
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
        aria-label={placeholder ?? labels.datePickerPlaceholder}
        collisionPadding={16}
        className="w-auto p-3"
        // The calendar focuses its own day cell; Radix would pick the first
        // button (previous month) instead.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <Calendar
          value={value}
          onChange={(next) => {
            setValue(next);
            setOpen(false);
          }}
          min={min}
          max={max}
          isDateDisabled={isDateDisabled}
          today={today}
          locale={locale}
          renderDay={renderDay}
          getDayDescription={getDayDescription}
          focusOnMount
        />
      </PopoverContent>
    </Popover>
  );
});
