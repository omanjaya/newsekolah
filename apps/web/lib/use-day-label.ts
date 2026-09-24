"use client";

import { useFormatter, useTranslations } from "next-intl";

import { dayKey, shiftDayKey } from "./group-by-day";
import { useSession } from "./session/session-provider";

/**
 * "Hari ini" / "Kemarin" for the two most recent day groups, a plain long
 * date otherwise -- the same day-grouping vocabulary notifications and
 * announcements both need (docs/07-ui-ux.md's "relatif hanya untuk < 24
 * jam", extended here to a two-day window since a day-grouped list reads
 * more naturally with "kemarin" than a bare date for the second group).
 */
export function useDayLabel(): (key: string) => string {
  const t = useTranslations("app.common");
  const format = useFormatter();
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  const todayKey = dayKey(new Date().toISOString(), timeZone);
  const yesterdayKey = shiftDayKey(todayKey, -1);

  return (key: string) => {
    if (key === todayKey) return t("today");
    if (key === yesterdayKey) return t("yesterday");
    const [y, m, d] = key.split("-").map(Number) as [number, number, number];
    return format.dateTime(new Date(Date.UTC(y, m - 1, d)), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  };
}
