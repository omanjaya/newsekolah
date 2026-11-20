"use client";

import { useState } from "react";

import { useSimulation } from "../../lib/simulation/clock";
import { isoWeekdayOf, todayInZone } from "../../lib/tenant-date";

import { cellDate, startOfIsoWeek } from "./week";

/**
 * The date the timetable is shown for: the day view's date, whose week
 * the class and teacher views show. It opens on today (and today's week),
 * because that is what a person almost always came to look at; a choice is
 * kept until the simulated clock moves (its revision).
 */
export function useScheduleDates(timeZone?: string): {
  today: string;
  dayDate: string;
  weekOf: string;
  dayOfWeek: number;
  setDayDate: (date: string) => void;
  setWeekOf: (monday: string) => void;
} {
  const { revision } = useSimulation();
  const today = todayInZone(timeZone);
  const [selected, setSelected] = useState<{ revision: number; date: string } | null>(null);
  const dayDate = selected !== null && selected.revision === revision ? selected.date : today;
  const dayOfWeek = isoWeekdayOf(dayDate);
  return {
    today,
    dayDate,
    weekOf: startOfIsoWeek(dayDate),
    dayOfWeek,
    setDayDate: (date) => {
      setSelected({ revision, date });
    },
    // Stepping the week keeps the weekday the day view was on.
    setWeekOf: (monday) => {
      setSelected({ revision, date: cellDate(monday, dayOfWeek) });
    },
  };
}
