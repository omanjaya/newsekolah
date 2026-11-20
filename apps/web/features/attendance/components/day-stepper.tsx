"use client";

import { Button, DatePicker, IconButton } from "@newsekolah/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactElement } from "react";

/** "YYYY-MM-DD" shifted by `delta` days, staying in UTC so DST never skips a day. */
export function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return `${String(next.getUTCFullYear())}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

const DAY_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

export interface DayStepperProps {
  value: string;
  onChange: (date: string) => void;
  /** The school's today, which the picker marks and "Hari ini" returns to. */
  today: string;
  labels: { previous: string; next: string; today: string; date: string };
  /**
   * How far the arrows move, in days: 1 (the default) steps a day, 7 a
   * week. A week stepper also passes `normalize` (the week's Monday), so
   * every date the reader lands on, by arrow or picker, is the week's
   * first day.
   */
  stepDays?: number;
  /** Maps a picked date onto the value the stepper holds (e.g. its week's Monday). */
  normalize?: (date: string) => string;
  /** How the picker shows the value; default "Jum, 20 Nov". */
  formatOptions?: Intl.DateTimeFormatOptions;
  min?: string;
  max?: string;
}

/**
 * One day (or one week) at a time: previous, the date (a picker that opens
 * the month), next, and a way back to today once the reader has moved off
 * it. Shared by the attendance day list, the homeroom summary and the
 * timetable's week and day views. On a phone it spans its row, the picker
 * taking the width the arrows leave; from 640px it keeps its own size.
 *
 * "Hari ini" removes itself once it is pressed, so it hands focus to the
 * date first: otherwise a keyboard user would land on `<body>`.
 */
export function DayStepper({
  value,
  onChange,
  today,
  labels,
  stepDays = 1,
  normalize = (date) => date,
  formatOptions = DAY_FORMAT,
  min,
  max,
}: DayStepperProps): ReactElement {
  const dateRef = useRef<HTMLButtonElement>(null);
  const home = normalize(today);
  return (
    <div className="flex w-full items-center gap-1.5 sm:w-auto">
      <IconButton
        icon={<ChevronLeft />}
        aria-label={labels.previous}
        variant="surface"
        disabled={min !== undefined && shiftDate(value, -1) < min}
        onClick={() => {
          onChange(normalize(shiftDate(value, -stepDays)));
        }}
      />
      <DatePicker
        ref={dateRef}
        value={value}
        onChange={(next) => {
          if (next) onChange(normalize(next));
        }}
        today={today}
        clearable={false}
        formatOptions={formatOptions}
        min={min}
        max={max}
        aria-label={labels.date}
        className="min-w-0 flex-1 sm:w-40 sm:flex-none"
      />
      <IconButton
        icon={<ChevronRight />}
        aria-label={labels.next}
        variant="surface"
        disabled={max !== undefined && shiftDate(value, stepDays) > max}
        onClick={() => {
          onChange(normalize(shiftDate(value, stepDays)));
        }}
      />
      {value !== home && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dateRef.current?.focus();
            onChange(home);
          }}
        >
          {labels.today}
        </Button>
      )}
    </div>
  );
}
