"use client";

import { useId, type ReactElement, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { DatePicker } from "./date-picker.js";
import { Field, FieldError } from "./field.js";
import { TimePicker } from "./time-picker.js";

/** "YYYY-MM-DDTHH:mm" (seconds dropped), or "" for none. */
function splitDateTime(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

function joinDateTime(date: string, time: string): string {
  return date === "" && time === "" ? "" : `${date}T${time}`;
}

function isShown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== "";
}

export interface DateTimeFieldProps {
  /** The moment as a `datetime-local` input holds it, "YYYY-MM-DDTHH:mm", or "" for none. */
  value: string;
  /** Called with "YYYY-MM-DDTHH:mm"; "" once both parts are emptied. */
  onChange: (value: string) => void;
  dateLabel: ReactNode;
  timeLabel: ReactNode;
  /** The time a newly picked date takes while none is set; "07:00", a school morning, by default. */
  defaultTime?: string;
  /** Earliest selectable day, "YYYY-MM-DD". */
  min?: string;
  /** Latest selectable day, "YYYY-MM-DD" (a note about today cannot be dated tomorrow). */
  max?: string;
  /** The school's "today", "YYYY-MM-DD", for the calendar. */
  today?: string;
  /** Spacing of the suggested times; any minute can still be typed. */
  minuteStep?: number;
  required?: boolean;
  disabled?: boolean;
  /** One hint for the pair, under both parts; it describes each of them. */
  hint?: ReactNode;
  /** One error for the pair, under both parts; each part is marked invalid and described by it. */
  error?: ReactNode;
  className?: string;
}

/**
 * One moment as two shared pickers side by side, the date and then the
 * time, each with its own label, over the "YYYY-MM-DDTHH:mm" string a
 * `datetime-local` input holds, so a form's state and submit stay as they
 * were. Picking a date first fills the time with `defaultTime`. A hint and
 * an error belong to the pair and show once, under both. The date takes
 * the wider share of the row, since it reads longer ("14 November 2026").
 */
export function DateTimeField({
  value,
  onChange,
  dateLabel,
  timeLabel,
  defaultTime = "07:00",
  min,
  max,
  today,
  minuteStep,
  required,
  disabled,
  hint,
  error,
  className,
}: DateTimeFieldProps): ReactElement {
  const { date, time } = splitDateTime(value);
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const hasHint = isShown(hint);
  const hasError = isShown(error);
  const describedBy =
    [hasHint ? hintId : undefined, hasError ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
        <Field label={dateLabel} required={required} disabled={disabled}>
          <DatePicker
            value={date}
            min={min}
            max={max}
            today={today}
            required={required}
            invalid={hasError || undefined}
            aria-describedby={describedBy}
            onChange={(next) => {
              onChange(joinDateTime(next, next === "" || time !== "" ? time : defaultTime));
            }}
          />
        </Field>
        <Field label={timeLabel} required={required} disabled={disabled}>
          <TimePicker
            value={time}
            minuteStep={minuteStep}
            required={required}
            invalid={hasError || undefined}
            aria-describedby={describedBy}
            onChange={(next) => {
              onChange(joinDateTime(date, next));
            }}
          />
        </Field>
      </div>
      {hasHint && (
        <p id={hintId} className="text-body-sm text-fg-muted">
          {hint}
        </p>
      )}
      {hasError && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
