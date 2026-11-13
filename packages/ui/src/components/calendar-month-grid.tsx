"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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
  /** Escape inside the grid; the calendar uses it to go back to the days. */
  onEscape?: () => void;
  className?: string;
}

const COLUMNS = 3;

function clampMonth(month: string, min?: string, max?: string): string {
  if (min && month < min) return min;
  if (max && month > max) return max;
  return month;
}

function monthKeyTarget(event: KeyboardEvent, month: string): string | null {
  const index = Number(month.slice(5)) - 1;
  const column = index % COLUMNS;
  switch (event.key) {
    case "ArrowLeft":
      return addIsoMonths(month, -1);
    case "ArrowRight":
      return addIsoMonths(month, 1);
    case "ArrowUp":
      return addIsoMonths(month, -COLUMNS);
    case "ArrowDown":
      return addIsoMonths(month, COLUMNS);
    case "Home":
      return addIsoMonths(month, -column);
    case "End":
      return addIsoMonths(month, COLUMNS - 1 - column);
    case "PageUp":
      return addIsoMonths(month, -12);
    case "PageDown":
      return addIsoMonths(month, 12);
    default:
      return null;
  }
}

/** A year of months, three by four, with year navigation: the month view of `Calendar` and the body of `MonthPicker`. */
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
  const yearId = useId();
  const tableRef = useRef<HTMLTableElement>(null);
  const handledFocusRequest = useRef(0);
  const [focused, setFocused] = useState(() => clampMonth(initialFocus, min, max));
  const [focusRequest, setFocusRequest] = useState(focusOnMount ? 1 : 0);
  const shortNames = useMemo(() => monthNames(locale, "short"), [locale]);
  const year = Number(focused.slice(0, 4));

  useEffect(() => {
    if (focusRequest === handledFocusRequest.current) return;
    handledFocusRequest.current = focusRequest;
    tableRef.current?.querySelector<HTMLElement>(`[data-month="${focused}"]`)?.focus();
  }, [focusRequest, focused]);

  const outOfRange = (month: string) =>
    (min !== undefined && month < min) || (max !== undefined && month > max);

  function moveYear(delta: number) {
    setFocused(clampMonth(addIsoMonths(focused, delta * 12), min, max));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!outOfRange(focused)) onSelect(focused);
      return;
    }
    const next = monthKeyTarget(event, focused);
    if (next === null) return;
    event.preventDefault();
    setFocused(clampMonth(next, min, max));
    setFocusRequest((count) => count + 1);
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
          disabled={min !== undefined && `${year - 1}-12` < min}
          onClick={() => {
            moveYear(-1);
          }}
        />
        <span
          id={yearId}
          aria-live="polite"
          className="font-heading text-base font-semibold text-fg tabular-nums"
        >
          {year}
        </span>
        <IconButton
          icon={<ChevronRight />}
          aria-label={labels.calendarNextYear}
          className="rounded-full"
          disabled={max !== undefined && `${year + 1}-01` > max}
          onClick={() => {
            moveYear(1);
          }}
        />
      </div>
      <table
        ref={tableRef}
        role="grid"
        aria-labelledby={yearId}
        // flex-1: inside the calendar the rows spread over the day view's
        // height rather than leaving an empty band under December.
        className="w-full flex-1 table-fixed border-separate border-spacing-1"
        onKeyDown={onKeyDown}
        onClick={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          const month = target?.closest<HTMLElement>("[data-month]")?.dataset.month;
          if (month && !outOfRange(month)) onSelect(month);
        }}
        onFocus={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          const month = target?.closest<HTMLElement>("[data-month]")?.dataset.month;
          if (month) setFocused(month);
        }}
      >
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((month) => {
                const disabled = outOfRange(month);
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
                    <span
                      className={cn(
                        "flex h-11 items-center justify-center rounded-full text-sm md:h-10",
                        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                        "group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-accent",
                        selected
                          ? "bg-accent font-semibold text-accent-fg group-hover:bg-accent-strong"
                          : "text-fg group-hover:bg-bg",
                        current && !selected && "font-semibold text-accent",
                        disabled && "text-fg-muted opacity-40 group-hover:bg-transparent",
                      )}
                    >
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
