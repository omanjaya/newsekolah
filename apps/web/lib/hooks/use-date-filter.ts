"use client";

import { useUrlState } from "./use-url-state";

/** Dates are safe shareable context; free-text names and form drafts stay out of URLs. */
export function useDateFilter(key: string, fallback: string, monthOnly = false) {
  return useUrlState<string>(
    key,
    (value) => {
      if (value === "") return fallback === "";
      if (!(monthOnly ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) return false;
      const date = new Date(`${value}${monthOnly ? "-01" : ""}T12:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
    },
    fallback,
  );
}
