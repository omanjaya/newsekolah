"use client";

import { useFormatter, useTranslations } from "next-intl";

import { formatCalendarDate } from "../../lib/format-calendar-date";

import type { ScheduleBlock } from "./api";
import { effectiveCaption } from "./block-policy";

const CAPTION_DATE = { weekday: "short", day: "numeric", month: "short" } as const;

/**
 * "Mulai Kam, 3 Des" / "Sampai Kam, 26 Nov" under a block that does not
 * cover the whole week shown (see `effectiveCaption`), so a lesson changed
 * from a date on says so where it is drawn.
 */
export function useEffectiveCaption(
  weekStart: string,
): (block: ScheduleBlock) => string | undefined {
  const t = useTranslations("app.schedule");
  const format = useFormatter();
  return (block) => {
    const caption = effectiveCaption(block, weekStart);
    if (!caption) return undefined;
    return t(caption.key, { date: formatCalendarDate(format, caption.date, CAPTION_DATE) });
  };
}
