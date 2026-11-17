"use client";

import { useState, type ReactElement } from "react";

import { useLocalToday } from "../../hooks/use-local-today.js";
import { cn } from "../../utils/cn.js";
import {
  formatIsoMonth,
  isoMonthOf,
  localTodayIso,
  normalizeIsoDate,
  normalizeIsoMonth,
  parseIsoMonth,
} from "../../utils/iso-date.js";
import { CalendarMonthGrid } from "../calendar-month-grid.js";
import { focusPickerGrid, keepEscapeForCalendarView, PICKER_POPOVER } from "../picker-field.js";
import { Popover, PopoverContent, PopoverTrigger } from "../popover.js";

import { FilterPillShell, PILL_MENU_TRIGGER_CLASS, PillChevron } from "./data-table-filter-pill.js";
import type { DataTableFilterDef } from "./data-table-filters.js";

/**
 * A month filter: the pill opens the same month grid `MonthPicker` uses,
 * keyboard included (arrows move, Enter picks, Escape closes), and a pick
 * applies at once. The chip names the month in the page's language.
 */
export function MonthFilterPill({
  filter,
  removeLabel,
  locale,
}: {
  filter: DataTableFilterDef;
  removeLabel: string;
  locale: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const localToday = useLocalToday();
  const today = normalizeIsoDate(filter.today) ?? localToday;
  const currentMonth = today ? isoMonthOf(today) : "";
  const value = parseIsoMonth(filter.value) ? (filter.value ?? "") : "";
  const active = value !== "";
  const triggerLabel = active ? `${filter.label}: ${formatIsoMonth(value, locale)}` : filter.label;

  return (
    <FilterPillShell
      active={active}
      removeLabel={removeLabel}
      onRemove={() => filter.onChange?.("")}
      trigger={
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                PILL_MENU_TRIGGER_CLASS,
                active
                  ? "text-accent-soft-fg hover:bg-state-hover"
                  : "text-fg hover:bg-state-hover",
              )}
            >
              {triggerLabel}
              <PillChevron active={active} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-label={filter.label}
            collisionPadding={16}
            className={cn(PICKER_POPOVER, "w-72")}
            onOpenAutoFocus={focusPickerGrid}
            onEscapeKeyDown={keepEscapeForCalendarView}
          >
            <CalendarMonthGrid
              value={value}
              initialFocus={value || currentMonth || isoMonthOf(localTodayIso())}
              currentMonth={currentMonth}
              min={normalizeIsoMonth(filter.minMonth)}
              max={normalizeIsoMonth(filter.maxMonth)}
              locale={locale}
              onSelect={(month) => {
                filter.onChange?.(month);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      }
    />
  );
}
