"use client";

import { formatTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Badge } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { type PickupHold, isLapsedHold, shownReservationStatus } from "../lib/reservation-pickup";
import { formatShortDate } from "../lib/short-date";
import { RESERVATION_STATUS_TONE, toneOf } from "../lib/status-tones";

type QueuedHold = PickupHold & { position?: number };

/** The school's calendar the pickup deadline is written on. */
export interface PickupCalendar {
  locale: Locale;
  timeZone: string | undefined;
  today?: string;
}

/**
 * A reservation's status badge. A ready hold past its pickup deadline reads
 * "Kedaluwarsa", even before the server's expiry job has released it.
 */
export function ReservationStatusBadge({
  reservation,
  now,
  size,
}: {
  reservation: QueuedHold;
  now: Date;
  size?: "sm";
}): ReactElement {
  const t = useTranslations("app.library.me.reserve");
  const status = shownReservationStatus(reservation, now);
  return (
    <Badge tone={toneOf(RESERVATION_STATUS_TONE, status)} size={size}>
      {status === "waiting" && reservation.position
        ? t("queuePosition", { position: reservation.position })
        : t(`status.${status}`)}
    </Badge>
  );
}

/** The pickup deadline of a ready hold, as a date and a time on the school's calendar. */
export function pickupDeadline(
  reservation: PickupHold,
  { locale, timeZone, today }: PickupCalendar,
): { date: string; time: string } | undefined {
  if (reservation.status !== "ready" || !reservation.expires_at) return undefined;
  return {
    date: formatShortDate(reservation.expires_at, locale, { timeZone, today }),
    time: formatTime(reservation.expires_at, { locale, timeZone }),
  };
}

/**
 * Words a ready hold's pickup deadline ("Ambil paling lambat 24 Nov pukul
 * 23.59", or "Batas ambil ... sudah lewat" once it has passed); undefined
 * for any other hold. A function, so a list can call it per row and put
 * the text in the row's meta line, which wraps, while the badge alone
 * sits in the trailing slot, which does not.
 */
export function usePickupDeadlineText(
  calendar: PickupCalendar,
): (reservation: PickupHold, now: Date) => string | undefined {
  const t = useTranslations("app.library.me.reserve");
  return (reservation, now) => {
    const deadline = pickupDeadline(reservation, calendar);
    if (!deadline) return undefined;
    return isLapsedHold(reservation, now) ? t("pickupPassed", deadline) : t("pickupBy", deadline);
  };
}

/**
 * The status badge plus, for a ready hold, the pickup deadline, side by
 * side and wrapping: for a row's meta line, where there is room to wrap.
 * Where the badge goes in a row's trailing slot, use ReservationStatusBadge
 * there and usePickupDeadlineText in the meta line instead.
 */
export function ReservationStatus({
  reservation,
  now,
  locale,
  timeZone,
  today,
  size,
}: PickupCalendar & {
  reservation: QueuedHold;
  now: Date;
  size?: "sm";
}): ReactElement {
  const deadlineText = usePickupDeadlineText({ locale, timeZone, today });
  const deadline = deadlineText(reservation, now);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <ReservationStatusBadge reservation={reservation} now={now} size={size} />
      {deadline && <span className="text-body-sm text-fg-muted">{deadline}</span>}
    </span>
  );
}
