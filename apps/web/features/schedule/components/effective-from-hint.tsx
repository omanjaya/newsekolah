"use client";

import { TextLink } from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import type { ScheduleHold } from "../api";
import { holdKey, holdLink } from "../schedule-hold";

const LONG_DATE = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
} as const;

/**
 * The "Berlaku mulai" hint of a change to a lesson with history: the
 * earliest date the server accepts and, when one record pushes it there,
 * what that record is and on which date ("Ditahan oleh permintaan guru
 * pengganti untuk Senin, 1 Maret 2027 (menunggu jawaban)"), with a link to
 * it. A pending or accepted request is the one hold a schedule manager can
 * release, so its sentence says so.
 */
export function EffectiveFromHint({
  min,
  hold,
}: {
  min: string;
  hold?: ScheduleHold;
}): ReactElement {
  const t = useTranslations("app.schedule.form");
  const format = useFormatter();
  const showDate = (iso: string) => formatCalendarDate(format, iso, LONG_DATE);
  const link = hold ? holdLink(hold) : undefined;
  return (
    <>
      {t("effectiveFromHintDated", { date: showDate(min) })}
      {hold && (
        <>
          {" "}
          {t(`heldBy.${holdKey(hold)}`, { date: showDate(hold.date) })}
          {link && (
            <>
              {" "}
              <TextLink variant="inline" href={link.href}>
                {t(`heldBy.${link.key}`)}
              </TextLink>
            </>
          )}
        </>
      )}
    </>
  );
}
