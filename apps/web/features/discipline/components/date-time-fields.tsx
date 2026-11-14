"use client";

import { DatePicker, Field, TimePicker } from "@newsekolah/ui";
import type { ReactElement } from "react";

/**
 * A moment as two shared pickers, date then time, over the
 * "YYYY-MM-DDTHH:mm" string a `datetime-local` input used to hold, so the
 * caller's state and submit stay as they were. packages/ui has no
 * combined date-time picker yet.
 */
export function DateTimeFields({
  value,
  onChange,
  dateLabel,
  timeLabel,
  required,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  dateLabel: string;
  timeLabel: string;
  required?: boolean;
  /** Latest selectable day, "YYYY-MM-DD". */
  max?: string;
}): ReactElement {
  const [date = "", time = ""] = value.split("T");
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={dateLabel} required={required}>
        <DatePicker
          value={date}
          max={max}
          required={required}
          onChange={(next) => {
            onChange(`${next}T${time || "07:00"}`);
          }}
        />
      </Field>
      <Field label={timeLabel} required={required}>
        <TimePicker
          value={time.slice(0, 5)}
          required={required}
          onChange={(next) => {
            onChange(`${date}T${next}`);
          }}
        />
      </Field>
    </div>
  );
}
