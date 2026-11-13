"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState, type ReactElement, type ReactNode } from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
import { useLocalToday } from "../hooks/use-local-today.js";
import { cn } from "../utils/cn.js";
import {
  addIsoMonths,
  clampIsoDate,
  formatIsoMonth,
  isIsoDate,
  isWithinIsoRange,
  isoMonthOf,
  localTodayIso,
} from "../utils/iso-date.js";

import { CalendarDayGrid, type CalendarDayInfo, type CalendarLayout } from "./calendar-day-grid.js";
import { CalendarMonthGrid } from "./calendar-month-grid.js";
import { IconButton } from "./icon-button.js";
import { useUiLabels } from "./ui-labels.js";

export type { CalendarDayInfo, CalendarLayout };

/** An inclusive range of ISO dates; "" marks an unset end, like the date filters use. */
export interface DateRange {
  from: string;
  to: string;
}

interface CalendarCommonProps {
  /** Month on display, "YYYY-MM". Leave it out to let the calendar track it. */
  month?: string;
  defaultMonth?: string;
  onMonthChange?: (month: string) => void;
  /** Earliest selectable date, "YYYY-MM-DD". */
  min?: string;
  /** Latest selectable date, "YYYY-MM-DD". */
  max?: string;
  /** Extra days to refuse (holidays, weekends); they stay focusable, as the grid pattern asks. */
  isDateDisabled?: (date: string) => boolean;
  /**
   * The school's "today", "YYYY-MM-DD", from the business clock in the
   * tenant's timezone. Falls back to the device's date after hydration.
   */
  today?: string;
  /** BCP 47 locale for month and weekday names; defaults to `UiLabels.locale` ("id-ID"). */
  locale?: string;
  /** Show the neighbouring months' days, muted, to fill six full weeks. Default true. */
  showOutsideDays?: boolean;
  /**
   * "compact" (default) sizes the grid for a picker; "fluid" stretches it
   * to its container with taller cells, for a page-level month view.
   */
  layout?: CalendarLayout;
  /** Status dots, event colours: rendered under the day number (fluid) or as markers (compact). */
  renderDay?: (day: CalendarDayInfo) => ReactNode;
  /** Appended to the day's accessible name, e.g. "Hadir", so markers are not visual only. */
  getDayDescription?: (date: string) => string | undefined;
  /** Move focus into the grid on mount (a picker opening). */
  focusOnMount?: boolean;
  className?: string;
}

export interface CalendarSingleProps extends CalendarCommonProps {
  mode?: "single";
  /** "YYYY-MM-DD", or ""/null for none. */
  value?: string | null;
  onChange?: (value: string) => void;
}

export interface CalendarRangeProps extends CalendarCommonProps {
  mode: "range";
  value?: DateRange | null;
  /** Called after each click: first with `to: ""`, then with both ends, ordered. */
  onChange?: (value: DateRange) => void;
}

export type CalendarProps = CalendarSingleProps | CalendarRangeProps;

/** The next range after picking `date`: a fresh start, or the end of a started one. */
export function nextDateRange(range: DateRange, date: string): DateRange {
  if (!range.from || range.to) return { from: date, to: "" };
  return date < range.from ? { from: date, to: range.from } : { from: range.from, to: date };
}

function selectionOf(props: CalendarProps): [string, string] {
  if (props.mode === "range") {
    const from = isIsoDate(props.value?.from) ? props.value.from : "";
    const to = from && isIsoDate(props.value?.to) ? props.value.to : "";
    return to && to < from ? [to, from] : [from, to];
  }
  const value = isIsoDate(props.value) ? props.value : "";
  return [value, value];
}

/**
 * A month grid on its own: single or range selection, min/max and disabled
 * days, a today marker, per-day slots for status dots, and the WAI-ARIA
 * date grid keyboard (arrows, Home/End, PageUp/PageDown, Shift for years,
 * Enter/Space). The caption opens a month and year view for long jumps.
 * Weeks start on Monday. Value-controlled: pass `value` and `onChange`.
 */
export function Calendar(props: CalendarProps): ReactElement {
  const { min, max, isDateDisabled, layout = "compact", showOutsideDays = true } = props;
  const labels = useUiLabels();
  const locale = props.locale ?? labels.locale;
  const localToday = useLocalToday();
  const today = props.today ?? localToday;
  const rangeMode = props.mode === "range";
  const [rangeFrom, rangeTo] = selectionOf(props);
  const captionId = useId();

  const fallbackMonth = isoMonthOf(clampIsoDate(rangeFrom || today || localTodayIso(), min, max));
  const [month, setMonth] = useControllableState(
    props.month,
    props.defaultMonth ?? fallbackMonth,
    props.onMonthChange,
  );
  const [view, setView] = useState<"days" | "months">("days");
  const [focusState, setFocusState] = useState<string | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(props.focusOnMount ? 1 : 0);

  const isDisabled = (date: string) =>
    !isWithinIsoRange(date, min, max) || (isDateDisabled?.(date) ?? false);

  const inMonth = (date: string) => date !== "" && isoMonthOf(date) === month;
  const focusedDate =
    focusState && inMonth(focusState)
      ? focusState
      : clampIsoDate([rangeFrom, today].find(inMonth) ?? `${month}-01`, min, max);

  function select(date: string) {
    if (!inMonth(date)) {
      // A muted neighbouring day: the grid turns to its month and the
      // clicked cell is rebuilt, so focus has to follow it explicitly.
      setMonth(isoMonthOf(date));
      setFocusRequest((count) => count + 1);
    }
    setFocusState(date);
    if (props.mode === "range") {
      const next = nextDateRange({ from: rangeFrom, to: rangeTo }, date);
      if (next.to) setPreviewDate(null);
      props.onChange?.(next);
    } else {
      props.onChange?.(date);
    }
  }

  function moveFocus(date: string) {
    const next = clampIsoDate(date, min, max);
    setFocusState(next);
    if (!inMonth(next)) setMonth(isoMonthOf(next));
    if (rangeMode) setPreviewDate(next);
    setFocusRequest((count) => count + 1);
  }

  function showDays() {
    setView("days");
    setFocusRequest((count) => count + 1);
  }

  const caption = formatIsoMonth(month, locale);
  const previousMonth = addIsoMonths(month, -1);
  const nextMonth = addIsoMonths(month, 1);

  return (
    <div
      className={cn(
        "grid grid-cols-1 grid-rows-1",
        layout === "fluid" ? "w-full" : "w-fit",
        props.className,
      )}
    >
      {/* Both views share one grid cell, so switching never resizes a popover. */}
      <div
        className={cn(
          "col-start-1 row-start-1 flex flex-col gap-1",
          view === "months" && "invisible",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={labels.calendarChooseMonth(caption)}
            className={cn(
              "inline-flex h-11 items-center gap-1 rounded-full px-3 md:h-8",
              "font-heading text-base font-semibold text-fg",
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-bg",
            )}
            onClick={() => {
              setView("months");
            }}
          >
            <span id={captionId} aria-live="polite">
              {caption}
            </span>
            <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
          </button>
          <div className="flex items-center">
            <IconButton
              icon={<ChevronLeft />}
              aria-label={labels.calendarPreviousMonth}
              className="rounded-full"
              disabled={min !== undefined && previousMonth < isoMonthOf(min)}
              onClick={() => {
                setMonth(previousMonth);
              }}
            />
            <IconButton
              icon={<ChevronRight />}
              aria-label={labels.calendarNextMonth}
              className="rounded-full"
              disabled={max !== undefined && nextMonth > isoMonthOf(max)}
              onClick={() => {
                setMonth(nextMonth);
              }}
            />
          </div>
        </div>
        <CalendarDayGrid
          month={month}
          locale={locale}
          today={today}
          focusedDate={focusedDate}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          previewDate={previewDate}
          rangeMode={rangeMode}
          layout={layout}
          showOutsideDays={showOutsideDays}
          isDisabled={isDisabled}
          renderDay={props.renderDay}
          getDayDescription={props.getDayDescription}
          focusRequest={focusRequest}
          labelledBy={captionId}
          onSelect={select}
          onFocusDate={(date) => {
            setFocusState(date);
            if (rangeMode) setPreviewDate(date);
          }}
          onKeyboardMove={moveFocus}
          onPreview={setPreviewDate}
        />
      </div>
      {view === "months" && (
        <CalendarMonthGrid
          // Zero width of its own: the day view sets the column, the month
          // view fills it (a full-width table would otherwise stretch it).
          className="col-start-1 row-start-1 w-0 min-w-full"
          value={rangeFrom ? isoMonthOf(rangeFrom) : ""}
          initialFocus={month}
          currentMonth={today ? isoMonthOf(today) : ""}
          min={min ? isoMonthOf(min) : undefined}
          max={max ? isoMonthOf(max) : undefined}
          locale={locale}
          focusOnMount
          onSelect={(picked) => {
            setMonth(picked);
            showDays();
          }}
          onEscape={showDays}
        />
      )}
    </div>
  );
}
