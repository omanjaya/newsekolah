"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, EmptyState } from "@newsekolah/ui";
import { CalendarX2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** The API's answer for a day the reader did not hold the homeroom duty. */
const NOT_HOMEROOM = "ATTENDANCE_NOT_HOMEROOM";

/**
 * True when a homeroom read was refused because the chosen day falls
 * outside the reader's homeroom term (before the duty starts or after it
 * ends). The page only opens for a reader who holds the duty, so the
 * refusal is about the date, not about access: no retry can succeed, and
 * "only homeroom teachers can see this" would be wrong (audit r5-n5).
 */
export function isOutsideHomeroomTerm(error: unknown): boolean {
  return error instanceof ApiError && error.code === NOT_HOMEROOM;
}

/** The chosen day in full ("Sabtu, 4 Juli 2026"), for sentences that name it. */
export function useLongDayLabel(date: string): string {
  const format = useFormatter();
  return format.dateTime(new Date(`${date}T00:00:00Z`), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Said in a dated homeroom tab (class attendance, guardians) for a day
 * outside the reader's homeroom term, with a way back to today when the
 * chosen day is another one.
 */
export function HomeroomOutOfTerm({
  date,
  onShowToday,
}: {
  date: string;
  /** Left out when the chosen day is already today. */
  onShowToday?: () => void;
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const dayLabel = useLongDayLabel(date);
  return (
    <EmptyState
      icon={<CalendarX2 aria-hidden="true" />}
      title={t("outOfTermTitle")}
      description={t("outOfTermMeta", { date: dayLabel })}
      action={
        onShowToday ? (
          <Button variant="secondary" onClick={onShowToday}>
            {t("outOfTermAction")}
          </Button>
        ) : undefined
      }
    />
  );
}
