"use client";

import { useState } from "react";

import { useSimulation } from "../../lib/simulation/clock";
import { isoWeekdayOf, todayInZone } from "../../lib/tenant-date";

import { cellDate, nearestSchoolDay, startOfIsoWeek, stepSchoolDay } from "./week";

/**
 * The date the timetable is shown for. The class and teacher views open on
 * today's week, the whole-school day view on today or, when the school is
 * closed today, the next school day (`activeDays`, the school's active ISO
 * weekdays; until they are known, today), because that is what a person
 * almost always came to look at. Stepping the day view moves from school
 * day to school day. A choice is kept until the simulated clock moves (its
 * revision).
 */
export function useScheduleDates(
  timeZone?: string,
  activeDays: readonly number[] = [],
): {
  today: string;
  dayDate: string;
  weekOf: string;
  dayOfWeek: number;
  setDayDate: (date: string) => void;
  setWeekOf: (monday: string) => void;
  /** The school day after (1) or before (-1) `date`, for the day view's arrows. */
  stepDay: (date: string, direction: 1 | -1) => string;
  /** A picked date moved onto the next school day. */
  normalizeDay: (date: string) => string;
} {
  const { revision } = useSimulation();
  const today = todayInZone(timeZone);
  const [selected, setSelected] = useState<{ revision: number; date: string } | null>(null);
  const picked = selected !== null && selected.revision === revision ? selected.date : null;
  const dayDate = picked ?? nearestSchoolDay(today, activeDays);
  const dayOfWeek = isoWeekdayOf(dayDate);
  return {
    today,
    dayDate,
    weekOf: startOfIsoWeek(picked ?? today),
    dayOfWeek,
    setDayDate: (date) => {
      setSelected({ revision, date });
    },
    // Stepping the week keeps the weekday the day view was on.
    setWeekOf: (monday) => {
      setSelected({ revision, date: cellDate(monday, dayOfWeek) });
    },
    stepDay: (date, direction) => stepSchoolDay(date, direction, activeDays),
    normalizeDay: (date) => nearestSchoolDay(date, activeDays),
  };
}
