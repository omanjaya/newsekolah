"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";
import {
  addDays,
  addMonths,
  endOfWeek,
  formatIsoDate,
  isoMonthOf,
  monthWeeks,
  startOfWeek,
  weekdayNames,
} from "../utils/iso-date.js";

/** What `renderDay` and `getDayDescription` know about one day cell. */
export interface CalendarDayInfo {
  /** "YYYY-MM-DD". */
  date: string;
  /** Day of the month, 1 to 31. */
  day: number;
  /** The day belongs to the previous or next month (padding of the grid). */
  outside: boolean;
  today: boolean;
  selected: boolean;
  disabled: boolean;
}

export type CalendarLayout = "compact" | "fluid";

interface DayGridProps {
  month: string;
  locale: string;
  today: string;
  focusedDate: string;
  /** Committed selection; a single date is a range of one. "" when unset. */
  rangeFrom: string;
  rangeTo: string;
  /** Range mode with only `rangeFrom` chosen: the day under the pointer or focus. */
  previewDate: string | null;
  rangeMode: boolean;
  layout: CalendarLayout;
  showOutsideDays: boolean;
  isDisabled: (date: string) => boolean;
  renderDay?: (day: CalendarDayInfo) => ReactNode;
  getDayDescription?: (date: string) => string | undefined;
  /** Bumped whenever the focused cell should take DOM focus (keyboard moves, opening). */
  focusRequest: number;
  labelledBy: string;
  onSelect: (date: string) => void;
  onFocusDate: (date: string) => void;
  onKeyboardMove: (date: string) => void;
  onPreview: (date: string | null) => void;
}

/**
 * A compact day cell: 44px tall on a touch screen, and 44px wide unless
 * the screen is too narrow for seven of those inside a popover (16px
 * collision margin, 12px padding and a 1px border each side: 3.75rem). At
 * 320px the cells give up a few pixels of width instead of the popover
 * running off the screen. 40px square once there is a cursor.
 */
const COMPACT_CELL = "h-11 w-[min(2.75rem,calc((100vw_-_3.75rem)/7))] md:pointer-fine:size-10";

const LONG_DAY: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
};

/** The WAI-ARIA date grid keys, Monday-first. */
function keyTarget(event: KeyboardEvent, date: string): string | null {
  switch (event.key) {
    case "ArrowLeft":
      return addDays(date, -1);
    case "ArrowRight":
      return addDays(date, 1);
    case "ArrowUp":
      return addDays(date, -7);
    case "ArrowDown":
      return addDays(date, 7);
    case "Home":
      return startOfWeek(date);
    case "End":
      return endOfWeek(date);
    case "PageUp":
      return addMonths(date, event.shiftKey ? -12 : -1);
    case "PageDown":
      return addMonths(date, event.shiftKey ? 12 : 1);
    default:
      return null;
  }
}

function dateOf(target: EventTarget): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-date]")?.dataset.date ?? null;
}

type BandEdge = "start" | "end" | "middle" | null;

function bandEdge(date: string, start: string, end: string): BandEdge {
  if (!start || start === end || date < start || date > end) return null;
  if (date === start) return "start";
  if (date === end) return "end";
  return "middle";
}

/**
 * The accent-soft band behind a range. Start and end cover only half a cell
 * so the endpoint pills cap the band; a band that wraps to the next week
 * gets rounded ends at the row's edges instead of a hard cut. Inside a row
 * each piece reaches a pixel into its neighbour: cells narrowed to a
 * fractional width on a small phone would otherwise show hairline seams
 * where two antialiased edges meet. The band colour is opaque, so the
 * overlap never shows.
 */
function bandPlacement(edge: BandEdge, column: number): string | null {
  if (edge === "start") return column === 6 ? null : "left-1/2 -right-px";
  if (edge === "end") return column === 0 ? null : "-left-px right-1/2";
  if (edge === "middle") {
    return cn(
      column === 0 ? "left-0 rounded-l-full" : "-left-px",
      column === 6 ? "right-0 rounded-r-full" : "-right-px",
    );
  }
  return null;
}

function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}

export function CalendarDayGrid(props: DayGridProps): ReactElement {
  const { month, locale, today, focusedDate, rangeFrom, rangeTo, previewDate } = props;
  const { rangeMode, layout, showOutsideDays, isDisabled, focusRequest } = props;
  const tableRef = useRef<HTMLTableElement>(null);
  const handledFocusRequest = useRef(0);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const shortNames = useMemo(() => weekdayNames(locale, "short"), [locale]);
  const longNames = useMemo(() => weekdayNames(locale, "long"), [locale]);
  const fluid = layout === "fluid";

  useEffect(() => {
    if (focusRequest === handledFocusRequest.current) return;
    handledFocusRequest.current = focusRequest;
    tableRef.current?.querySelector<HTMLElement>(`[data-date="${focusedDate}"]`)?.focus();
  }, [focusRequest, focusedDate]);

  const committedEnd = rangeTo || rangeFrom;
  // While a range waits for its end, the band follows the pointer or focus.
  let bandStart = rangeFrom;
  let bandEnd = committedEnd;
  if (rangeMode && rangeFrom && !rangeTo && previewDate) {
    [bandStart, bandEnd] =
      previewDate < rangeFrom ? [previewDate, rangeFrom] : [rangeFrom, previewDate];
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isDisabled(focusedDate)) props.onSelect(focusedDate);
      return;
    }
    const next = keyTarget(event, focusedDate);
    if (next === null) return;
    event.preventDefault();
    props.onKeyboardMove(next);
  }

  function onClick(event: MouseEvent<HTMLTableElement>) {
    const date = dateOf(event.target);
    if (date && !isDisabled(date)) props.onSelect(date);
  }

  function renderCell(date: string, column: number): ReactElement {
    const outside = isoMonthOf(date) !== month;
    if (outside && !showOutsideDays) {
      return <td key={date} role="gridcell" className="p-0" />;
    }
    const disabled = isDisabled(date);
    const info: CalendarDayInfo = {
      date,
      day: Number(date.slice(8)),
      outside,
      today: date === today,
      selected: rangeFrom !== "" && date >= rangeFrom && date <= committedEnd,
      disabled,
    };
    const edge = bandEdge(date, bandStart, bandEnd);
    const endpoint = bandStart !== "" && (date === bandStart || date === bandEnd);
    const label = [formatIsoDate(date, locale, LONG_DAY), props.getDayDescription?.(date)];
    return (
      <td
        key={date}
        role="gridcell"
        data-date={date}
        tabIndex={date === focusedDate ? 0 : -1}
        aria-selected={info.selected}
        aria-disabled={disabled || undefined}
        aria-current={info.today ? "date" : undefined}
        aria-label={label.filter(Boolean).join(", ")}
        className={cn(
          "group relative p-0 outline-none",
          fluid ? "h-16 align-top md:h-20" : COMPACT_CELL,
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <DayBand placement={bandPlacement(edge, column)} fluid={fluid} />
        <DayContent
          info={info}
          fluid={fluid}
          filled={endpoint && (date === rangeFrom || date === committedEnd)}
          pending={endpoint && date !== rangeFrom && date !== committedEnd}
          inBand={edge === "middle"}
          extra={props.renderDay?.(info)}
        />
      </td>
    );
  }

  return (
    <table
      ref={tableRef}
      role="grid"
      aria-labelledby={props.labelledBy}
      aria-multiselectable={rangeMode || undefined}
      className={cn(
        "border-separate border-spacing-x-0 border-spacing-y-0.5",
        fluid ? "w-full table-fixed" : "mx-auto",
      )}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onFocus={(event) => {
        const date = dateOf(event.target);
        if (date) props.onFocusDate(date);
      }}
      onMouseOver={(event) => {
        if (rangeMode) props.onPreview(dateOf(event.target));
      }}
      onMouseLeave={() => {
        if (rangeMode) props.onPreview(null);
      }}
    >
      <thead>
        <tr>
          {shortNames.map((name, index) => (
            <th
              key={name}
              scope="col"
              abbr={longNames[index]}
              className="h-8 p-0 text-center text-caption text-fg-muted"
            >
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>{week.map((date, column) => renderCell(date, column))}</tr>
        ))}
      </tbody>
    </table>
  );
}

function DayBand({
  placement,
  fluid,
}: {
  placement: string | null;
  fluid: boolean;
}): ReactElement | null {
  if (!placement) return null;
  // Behind the pill row only: in the fluid layout the cell is taller than
  // the pill, and a band filling it would read as a selected block.
  return (
    <span
      aria-hidden="true"
      className={cn("absolute bg-accent-soft", fluid ? "top-1.5 h-8" : "inset-y-0.5", placement)}
    />
  );
}

interface DayContentProps {
  info: CalendarDayInfo;
  fluid: boolean;
  /** A committed endpoint (or the single selected day): the accent pill. */
  filled: boolean;
  /** The provisional end of a range still being chosen: an outlined pill. */
  pending: boolean;
  inBand: boolean;
  extra: ReactNode;
}

function DayContent({
  info,
  fluid,
  filled,
  pending,
  inBand,
  extra,
}: DayContentProps): ReactElement {
  const showExtra = hasContent(extra);
  const pill = (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full text-body tabular-nums",
        "transition-colors",
        // As wide as the cell up to 40px (36 with a cursor) and square, so
        // the pill stays round in a narrowed cell. A percentage width adds
        // nothing to the column's minimum, which a fixed 40px would.
        fluid
          ? "size-8"
          : "aspect-square w-full max-w-10 group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-focus-ring md:pointer-fine:max-w-9",
        info.outside ? "text-fg-muted opacity-60" : "text-fg",
        inBand && !info.outside && "text-accent-soft-fg",
        info.today && !filled && "font-semibold text-accent",
        !fluid && !info.disabled && !filled && "group-hover:bg-state-hover",
        pending && "bg-surface ring-1 ring-accent ring-inset",
        filled && "bg-accent font-semibold text-accent-fg group-hover:bg-accent-strong",
        // A refused day of this month (out of bounds, a weekend, a holiday)
        // is struck through, so it never reads as a neighbouring month's
        // day, which is only muted; a refused neighbouring day stays muted
        // and fades a step further.
        info.disabled &&
          (info.outside ? "opacity-40" : "text-fg-muted line-through decoration-1 opacity-70"),
      )}
    >
      {info.day}
      {/* Compact cells have room under the number for either the today
          dot or the caller's markers, not both; markers win. */}
      {!fluid && (showExtra || info.today) && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5"
        >
          {showExtra ? (
            extra
          ) : (
            <span className={cn("size-1 rounded-full", filled ? "bg-accent-fg" : "bg-accent")} />
          )}
        </span>
      )}
    </span>
  );
  if (!fluid) {
    return <span className="relative flex size-full items-center justify-center">{pill}</span>;
  }
  // A page-sized cell is the target as a whole, so it hovers and takes the
  // focus ring as a whole too, not just the number in it.
  return (
    <span
      className={cn(
        "relative flex size-full flex-col items-center gap-1 rounded-md pt-1.5",
        "transition-colors",
        "group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus-ring",
        !info.disabled && !inBand && "group-hover:bg-state-hover",
      )}
    >
      {pill}
      {showExtra && (
        <span className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-hidden px-1">
          {extra}
        </span>
      )}
    </span>
  );
}
