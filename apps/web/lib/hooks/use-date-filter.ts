"use client";

import { useSimulation } from "../simulation/clock";

import { useUrlState } from "./use-url-state";

/**
 * Whether `value` may stand in the URL for a date filter: a real calendar
 * day ("YYYY-MM-DD", or "YYYY-MM" with `monthOnly`), or "" when the filter
 * is unset by default.
 */
export function isDateFilterValue(value: string, fallback: string, monthOnly = false): boolean {
  if (value === "") return fallback === "";
  if (!(monthOnly ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) return false;
  const date = new Date(`${value}${monthOnly ? "-01" : ""}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Dates are safe shareable context; free-text names and form drafts stay out of URLs. */
export function useDateFilter(key: string, fallback: string, monthOnly = false) {
  // Simulation changes refresh the fallback; a date explicitly chosen in the URL remains selected.
  useSimulation();
  return useUrlState<string>(
    key,
    (value) => isDateFilterValue(value, fallback, monthOnly),
    fallback,
  );
}
