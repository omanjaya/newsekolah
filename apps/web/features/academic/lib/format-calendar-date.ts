import type { useFormatter } from "next-intl";

/** A YYYY-MM-DD calendar date as a short id-ID style date, read at local midnight. */
export function formatCalendarDate(format: ReturnType<typeof useFormatter>, value: string): string {
  return format.dateTime(new Date(`${value}T00:00:00`), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
