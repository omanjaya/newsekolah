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

export interface DayStepperProps {
  value: string;
  onChange: (date: string) => void;
  /** The school's today, which the picker marks and "Hari ini" returns to. */
  today: string;
  labels: { previous: string; next: string; today: string; date: string };
}

/**
 * One day at a time: previous, the date (a picker that opens the month),
 * next, and a way back to today once the reader has moved off it. Shared by
 * the attendance day list and the homeroom summary. On a phone it spans
 * its row, the picker taking the width the arrows leave; from 640px it
 * keeps its own size.
 *
 * "Hari ini" removes itself once it is pressed, so it hands focus to the
 * date first: otherwise a keyboard user would land on `<body>`.
 */
export function DayStepper({ value, onChange, today, labels }: DayStepperProps): ReactElement {
  const dateRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex w-full items-center gap-1.5 sm:w-auto">
      <IconButton
        icon={<ChevronLeft />}
        aria-label={labels.previous}
        variant="surface"
        onClick={() => {
          onChange(shiftDate(value, -1));
        }}
      />
      <DatePicker
        ref={dateRef}
        value={value}
        onChange={(next) => {
          if (next) onChange(next);
        }}
        today={today}
        clearable={false}
        formatOptions={{ weekday: "short", day: "numeric", month: "short" }}
        aria-label={labels.date}
        className="min-w-0 flex-1 sm:w-40 sm:flex-none"
      />
      <IconButton
        icon={<ChevronRight />}
        aria-label={labels.next}
        variant="surface"
        onClick={() => {
          onChange(shiftDate(value, 1));
        }}
      />
      {value !== today && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dateRef.current?.focus();
            onChange(today);
          }}
        >
          {labels.today}
        </Button>
      )}
    </div>
  );
}
