"use client";

import { useFormatter, useTranslations } from "next-intl";

import { formatCalendarDate, formatCalendarDateRange } from "../../lib/format-calendar-date";

import type { ScheduleBlock } from "./api";
import { effectiveCaption } from "./block-policy";

/** "Kam, 26 Nov": how a date reads on a lesson in the grid or the agenda. */
export const CAPTION_DATE = { weekday: "short", day: "numeric", month: "short" } as const;

/**
 * "Mulai Kam, 3 Des" / "Sampai Kam, 26 Nov" / "Hanya Kam, 26 Nov" under a
 * block that does not cover the whole week shown (see `effectiveCaption`),
 * so a lesson changed from a date on says so where it is drawn, and one
 * that both starts and stops within the week says that it stops as well.
 */
export function useEffectiveCaption(
  weekStart: string,
): (block: ScheduleBlock) => string | undefined {
  const t = useTranslations("app.schedule");
  const format = useFormatter();
  return (block) => {
    const caption = effectiveCaption(block, weekStart);
    if (!caption) return undefined;
    const date =
      caption.until === undefined
        ? formatCalendarDate(format, caption.date, CAPTION_DATE)
        : formatCalendarDateRange(format, caption.date, caption.until, CAPTION_DATE);
    return t(caption.key, { date });
  };
}
