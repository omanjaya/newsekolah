import type { Locale } from "@newsekolah/i18n";

import { clockLabel, clockRange } from "../../schedule/clock-label";
import type { Extracurricular } from "../api";

/** Weekday keys of the catalog (`clubs.weekdays.*`), indexed like the API's `meeting_day` (0 = Sunday). */
export const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/**
 * A club's weekly meeting as people read it: "Jumat, 15.00 – 16.30", the
 * day alone when it has no times, or `undefined` when no day is set.
 */
export function clubScheduleLabel(
  club: Pick<Extracurricular, "meeting_day" | "meeting_start" | "meeting_end">,
  weekday: (key: WeekdayKey) => string,
  locale: Locale,
): string | undefined {
  if (club.meeting_day === undefined) return undefined;
  const day = weekday(WEEKDAY_KEYS[club.meeting_day] ?? "sunday");
  const time =
    club.meeting_start && club.meeting_end
      ? clockRange(club.meeting_start, club.meeting_end, locale)
      : club.meeting_start
        ? clockLabel(club.meeting_start, locale)
        : undefined;
  return time ? `${day}, ${time}` : day;
}
