"use client";

import { TextLink } from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import type { ScheduleHold } from "../api";

const LONG_DATE = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
} as const;

/** The sentence that names a hold, by its kind (and a request's status). */
function holdKey(hold: ScheduleHold): string {
  if (hold.kind !== "substitution") return hold.kind;
  return hold.status === "accepted" ? "substitutionAccepted" : "substitutionPending";
}

/**
 * Where a hold can be looked at: a request on the school-wide substitutions
 * list, where a schedule manager can cancel it, and a recorded session on
 * that day's attendance. A supervision visit has no page of its own here.
 */
function holdLink(hold: ScheduleHold): { href: string; key: string } | undefined {
  if (hold.kind === "substitution") {
    return { href: "/substitutions?view=all", key: "openSubstitutions" };
  }
  if (hold.kind === "attendance") {
    return { href: `/attendance?date=${hold.date}`, key: "openAttendance" };
  }
  return undefined;
}

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
