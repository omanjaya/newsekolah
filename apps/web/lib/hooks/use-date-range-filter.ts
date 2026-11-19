"use client";

import { useCallback, useState } from "react";

import { isDateFilterValue, useDateFilter } from "./use-date-filter";

export interface DateRange {
  /** "YYYY-MM-DD", or "" for an open start. */
  from: string;
  /** "YYYY-MM-DD", or "" for an open end. */
  to: string;
}

export interface DateRangeFilterOptions {
  /** The page's own period start ("" for none); also what an invalid URL value falls back to. */
  defaultFrom?: string;
  /** The page's own period end ("" for none). */
  defaultTo?: string;
  fromKey?: string;
  toKey?: string;
}

/**
 * A from/to date filter kept in the URL as one value.
 *
 * Both bounds change in a single history entry, so Back after a picked
 * range returns to the range before it, never to a half-applied one with
 * only the new start. A reversed pair from a shared or hand-edited link
 * (`?from=2026-11-19&to=2026-11-01`) is read in calendar order, so the list
 * shows 1 to 19 November instead of an unexplained empty result.
 */
export function useDateRangeFilter({
  defaultFrom = "",
  defaultTo = "",
  fromKey = "from",
  toKey = "to",
}: DateRangeFilterOptions = {}): readonly [
  DateRange,
  (next: DateRange, options?: { replace?: boolean }) => void,
] {
  const [rawFrom] = useDateFilter(fromKey, defaultFrom);
  const [rawTo] = useDateFilter(toKey, defaultTo);
  // Next applies a history write to `useSearchParams()` in a transition;
  // this re-render picks the new value up as soon as it lands.
  const [, refresh] = useState(0);
  const reversed = rawFrom !== "" && rawTo !== "" && rawFrom > rawTo;
  const range: DateRange = reversed ? { from: rawTo, to: rawFrom } : { from: rawFrom, to: rawTo };

  const setRange = useCallback(
    (next: DateRange, options?: { replace?: boolean }) => {
      const url = new URL(window.location.href);
      const bounds: [string, string, string][] = [
        [fromKey, next.from, defaultFrom],
        [toKey, next.to, defaultTo],
      ];
      for (const [key, value, fallback] of bounds) {
        // Same rule as a single date filter: an invalid value is not
        // written, and an unset bound with no default drops its key.
        if (!isDateFilterValue(value, fallback)) continue;
        if (value === "" && fallback === "") url.searchParams.delete(key);
        else url.searchParams.set(key, value);
      }
      if (url.href === window.location.href) return;
      window.history[options?.replace ? "replaceState" : "pushState"](null, "", url.href);
      refresh((version) => version + 1);
    },
    [fromKey, toKey, defaultFrom, defaultTo],
  );

  return [range, setRange] as const;
}
