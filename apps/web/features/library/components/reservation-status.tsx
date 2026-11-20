"use client";

import { formatTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import { Badge } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { type PickupHold, isLapsedHold } from "../lib/reservation-pickup";
import { formatShortDate } from "../lib/short-date";
import { RESERVATION_STATUS_TONE, toneOf } from "../lib/status-tones";

/**
 * A reservation's status badge plus, for a ready hold, the pickup deadline
 * on the school's calendar ("Ambil paling lambat 24 Nov pukul 23.59"). A
 * hold past its deadline reads "Kedaluwarsa" with the deadline it missed,
 * even before the server's expiry job has released it. Shared by the
 * member's own page and the librarian's member page so both say the same.
 */
export function ReservationStatus({
  reservation,
  now,
  locale,
  timeZone,
  today,
  size,
}: {
  reservation: PickupHold & { position?: number };
  now: Date;
  locale: Locale;
  timeZone: string | undefined;
  today?: string;
  size?: "sm";
}): ReactElement {
  const t = useTranslations("app.library.me.reserve");
  const lapsed = isLapsedHold(reservation, now);
  const status = lapsed ? "expired" : reservation.status;
  const deadline =
    reservation.status === "ready" && reservation.expires_at
      ? {
          date: formatShortDate(reservation.expires_at, locale, { timeZone, today }),
          time: formatTime(reservation.expires_at, { locale, timeZone }),
        }
      : undefined;

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={toneOf(RESERVATION_STATUS_TONE, status)} size={size}>
        {status === "waiting" && reservation.position
          ? t("queuePosition", { position: reservation.position })
          : t(`status.${status}`)}
      </Badge>
      {deadline && (
        <span className="text-body-sm text-fg-muted">
          {lapsed ? t("pickupPassed", deadline) : t("pickupBy", deadline)}
        </span>
      )}
    </span>
  );
}
