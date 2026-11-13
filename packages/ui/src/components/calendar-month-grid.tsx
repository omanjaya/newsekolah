"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import { cn } from "../utils/cn.js";
import { addIsoMonths, formatIsoMonth, monthNames, toIsoMonth } from "../utils/iso-date.js";

import { IconButton } from "./icon-button.js";
import { useUiLabels } from "./ui-labels.js";

export interface CalendarMonthGridProps {
  /** Selected month, "YYYY-MM", or "" for none. */
  value: string;
  /** Month that holds the roving focus first, "YYYY-MM". */
  initialFocus: string;
  /** The month containing today, "YYYY-MM", or "" when unknown. */
  currentMonth: string;
  min?: string;
  max?: string;
  locale: string;
  focusOnMount?: boolean;
  onSelect: (month: string) => void;
  /** Escape inside the month grid; the calendar uses it to go back to the days. */
  onEscape?: () => void;
  className?: string;
}

/**
 * Marks a grid that takes Escape to go back a level (years to months,
 * months to days). Radix closes a popover on Escape before any React
 * handler runs, so a picker checks for this in `onEscapeKeyDown` and lets
 * the grid have the key instead.
 */
export const CALENDAR_BACK_SELECTOR = "[data-calendar-back]";

const COLUMNS = 3;
const YEARS_PER_PAGE = 12;

function clampMonth(month: string, min?: string, max?: string): string {
  if (min && month < min) return min;
  if (max && month > max) return max;
  return month;
}

/** First year of the 12-year page holding `year` (2016 for 2026). */
function pageStartOf(year: number): number {
  return year - (((year % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE);
}

/** How far the WAI-ARIA grid keys move in a three-column grid of 12: one, a row, a page. */
function gridKeyDelta(event: KeyboardEvent, column: number): number | null {
  switch (event.key) {
    case "ArrowLeft":
      return -1;
    case "ArrowRight":
      return 1;
    case "ArrowUp":
      return -COLUMNS;
    case "ArrowDown":
      return COLUMNS;
    case "Home":
      return -column;
    case "End":
      return COLUMNS - 1 - column;
    case "PageUp":
      return -12;
    case "PageDown":
      return 12;
    default:
      return null;
  }
}

function cellClassName(selected: boolean, current: boolean, disabled: boolean): string {
  return cn(
    "flex h-11 items-center justify-center rounded-full text-sm tabular-nums md:h-10",
    "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
    "group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-accent",
    selected
      ? "bg-accent font-semibold text-accent-fg group-hover:bg-accent-strong"
      : "text-fg group-hover:bg-bg",
    current && !selected && "font-semibold text-accent",
    disabled && "text-fg-muted opacity-40 group-hover:bg-transparent",
  );
}

function cellTarget(target: EventTarget, attribute: "month" | "year"): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>(`[data-${attribute}]`)?.dataset[attribute];
}

/**
 * A year of months, three by four, with year navigation: the month view of
 * `Calendar` and the body of `MonthPicker`. The year in the header opens a
 * page of twelve years for long jumps (a birth year decades back), and
 * Escape there comes back to the months.
 */
export function CalendarMonthGrid({
  value,
  initialFocus,
  currentMonth,
  min,
  max,
  locale,
  focusOnMount,
  onSelect,
  onEscape,
  className,
}: CalendarMonthGridProps): ReactElement {
  const labels = useUiLabels();
  const headingId = useId();
  const tableRef = useRef<HTMLTableElement>(null);
  const handledFocusRequest = useRef(0);
  const [view, setView] = useState<"months" | "years">("months");
  const [focused, setFocused] = useState(() => clampMonth(initialFocus, min, max));
  const [focusedYear, setFocusedYear] = useState(() => Number(focused.slice(0, 4)));
  const [focusRequest, setFocusRequest] = useState(focusOnMount ? 1 : 0);
  const shortNames = useMemo(() => monthNames(locale, "short"), [locale]);
  const year = Number(focused.slice(0, 4));
  const minYear = min ? Number(min.slice(0, 4)) : undefined;
  const maxYear = max ? Number(max.slice(0, 4)) : undefined;

  useEffect(() => {
    if (focusRequest === handledFocusRequest.current) return;
    handledFocusRequest.current = focusRequest;
    tableRef.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus();
  }, [focusRequest, view, focused, focusedYear]);

  const requestFocus = () => {
    setFocusRequest((count) => count + 1);
  };

  const monthOutOfRange = (month: string) =>
    (min !== undefined && month < min) || (max !== undefined && month > max);
  const yearOutOfRange = (candidate: number) =>
    (minYear !== undefined && candidate < minYear) ||
    (maxYear !== undefined && candidate > maxYear);
  const clampYear = (candidate: number) => {
    if (minYear !== undefined && candidate < minYear) return minYear;
    if (maxYear !== undefined && candidate > maxYear) return maxYear;
    return candidate;
  };

  function moveYear(delta: number) {
    setFocused(clampMonth(addIsoMonths(focused, delta * 12), min, max));
  }

  function showYears() {
    setFocusedYear(year);
    setView("years");
    requestFocus();
  }

  function showMonths(pickedYear?: number) {
    if (pickedYear !== undefined) {
      const month = Number(focused.slice(5));
      setFocused(clampMonth(toIsoMonth({ year: pickedYear, month }), min, max));
    }
    setView("months");
    requestFocus();
  }

  function onMonthKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!monthOutOfRange(focused)) onSelect(focused);
      return;
    }
    const delta = gridKeyDelta(event, (Number(focused.slice(5)) - 1) % COLUMNS);
    if (delta === null) return;
    event.preventDefault();
    setFocused(clampMonth(addIsoMonths(focused, delta), min, max));
    requestFocus();
  }

  function onYearKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      showMonths();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!yearOutOfRange(focusedYear)) showMonths(focusedYear);
      return;
    }
    const delta = gridKeyDelta(event, (focusedYear - pageStartOf(focusedYear)) % COLUMNS);
    if (delta === null) return;
    event.preventDefault();
    setFocusedYear(clampYear(focusedYear + delta));
    requestFocus();
  }

  if (view === "years") {
    const pageStart = pageStartOf(focusedYear);
    const pageEnd = pageStart + YEARS_PER_PAGE - 1;
    const valueYear = value ? Number(value.slice(0, 4)) : null;
    const currentYear = currentMonth ? Number(currentMonth.slice(0, 4)) : null;
    const rows = Array.from({ length: YEARS_PER_PAGE / COLUMNS }, (_, row) =>
      Array.from({ length: COLUMNS }, (_, column) => pageStart + row * COLUMNS + column),
    );
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-center justify-between gap-1">
          <IconButton
            icon={<ChevronLeft />}
            aria-label={labels.calendarPreviousYears}
            className="rounded-full"
            disabled={minYear !== undefined && pageStart - 1 < minYear}
            onClick={() => {
              setFocusedYear(clampYear(focusedYear - YEARS_PER_PAGE));
            }}
          />
          <span
            id={headingId}
            aria-live="polite"
            className="font-heading text-base font-semibold text-fg tabular-nums"
          >
            {`${String(pageStart)}–${String(pageEnd)}`}
          </span>
          <IconButton
            icon={<ChevronRight />}
            aria-label={labels.calendarNextYears}
            className="rounded-full"
            disabled={maxYear !== undefined && pageEnd + 1 > maxYear}
            onClick={() => {
              setFocusedYear(clampYear(focusedYear + YEARS_PER_PAGE));
            }}
          />
        </div>
        <table
          ref={tableRef}
          role="grid"
          aria-labelledby={headingId}
          data-calendar-back=""
          className="w-full flex-1 table-fixed border-separate border-spacing-1"
          onKeyDown={onYearKeyDown}
          onClick={(event) => {
            const picked = Number(cellTarget(event.target, "year"));
            if (picked && !yearOutOfRange(picked)) showMonths(picked);
          }}
          onFocus={(event) => {
            const picked = Number(cellTarget(event.target, "year"));
            if (picked) setFocusedYear(picked);
          }}
        >
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cellYear) => {
                  const disabled = yearOutOfRange(cellYear);
                  const selected = cellYear === valueYear;
                  return (
                    <td
                      key={cellYear}
                      role="gridcell"
                      data-year={cellYear}
                      tabIndex={cellYear === focusedYear ? 0 : -1}
                      aria-selected={selected}
                      aria-disabled={disabled || undefined}
                      aria-current={cellYear === currentYear ? "date" : undefined}
                      className={cn(
                        "group p-0 outline-none",
                        disabled ? "cursor-not-allowed" : "cursor-pointer",
                      )}
                    >
                      <span className={cellClassName(selected, cellYear === currentYear, disabled)}>
                        {cellYear}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const rows = Array.from({ length: 12 / COLUMNS }, (_, row) =>
    Array.from({ length: COLUMNS }, (_, column) =>
      toIsoMonth({ year, month: row * COLUMNS + column + 1 }),
    ),
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-1">
        <IconButton
          icon={<ChevronLeft />}
          aria-label={labels.calendarPreviousYear}
          className="rounded-full"
          disabled={min !== undefined && `${String(year - 1)}-12` < min}
          onClick={() => {
            moveYear(-1);
          }}
        />
        <button
          type="button"
          aria-label={labels.calendarChooseYear(String(year))}
          className={cn(
            "inline-flex h-11 items-center gap-1 rounded-full px-3 md:h-8",
            "font-heading text-base font-semibold text-fg tabular-nums",
            "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-bg",
          )}
          onClick={showYears}
        >
          <span id={headingId} aria-live="polite">
            {year}
          </span>
          <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
        </button>
        <IconButton
          icon={<ChevronRight />}
          aria-label={labels.calendarNextYear}
          className="rounded-full"
          disabled={max !== undefined && `${String(year + 1)}-01` > max}
          onClick={() => {
            moveYear(1);
          }}
        />
      </div>
      <table
        ref={tableRef}
        role="grid"
        aria-labelledby={headingId}
        data-calendar-back={onEscape ? "" : undefined}
        // flex-1: inside the calendar the rows spread over the day view's
        // height rather than leaving an empty band under December.
        className="w-full flex-1 table-fixed border-separate border-spacing-1"
        onKeyDown={onMonthKeyDown}
        onClick={(event) => {
          const month = cellTarget(event.target, "month");
          if (month && !monthOutOfRange(month)) onSelect(month);
        }}
        onFocus={(event) => {
          const month = cellTarget(event.target, "month");
          if (month) setFocused(month);
        }}
      >
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((month) => {
                const disabled = monthOutOfRange(month);
                const selected = month === value;
                const current = month === currentMonth;
                return (
                  <td
                    key={month}
                    role="gridcell"
                    data-month={month}
                    tabIndex={month === focused ? 0 : -1}
                    aria-selected={selected}
                    aria-disabled={disabled || undefined}
                    aria-current={current ? "date" : undefined}
                    aria-label={formatIsoMonth(month, locale)}
                    className={cn(
                      "group p-0 outline-none",
                      disabled ? "cursor-not-allowed" : "cursor-pointer",
                    )}
                  >
                    <span className={cellClassName(selected, current, disabled)}>
                      {shortNames[Number(month.slice(5)) - 1]}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
