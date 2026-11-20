"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime, formatTime, formatWeekdayDate } from "@newsekolah/i18n";
import { Alert, Button } from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { isoToZonedLocal } from "../../../lib/tenant-date";

/** Where a school's attendance policy, its correction window included, is set. */
export const ATTENDANCE_SETTINGS_HREF = "/settings/attendance";

/**
 * Why the session cannot be saved right now, above the roster: the lesson
 * was handed to a substitute, it has not started yet, or this viewer's
 * save window has closed. A handed-over lesson the viewer may still correct
 * (the API sends an editable_until) says so instead of "view only", but
 * only once the lesson has started: before then the save stays refused,
 * so the not-started notice wins. Its closed window still warns once the
 * correction deadline passes.
 *
 * A closed window names when it ended (the API's editable_until, on the
 * school's clock); when only the server's refusal is known, its own
 * message. A lesson on a later day than today names that day, since its
 * start time alone reads as later today.
 */
export function SessionWindowNotice({
  startsAt,
  notStartedYet,
  editableUntil,
  windowEnded,
  closedCode,
  handedOver = false,
  today,
  timeZone,
}: {
  startsAt?: string;
  notStartedYet: boolean;
  editableUntil?: string;
  /** The client clock is past editableUntil. */
  windowEnded: boolean;
  /** The error code a save was refused with for its window, if any. */
  closedCode: string | null;
  /**
   * An accepted substitute fills this lesson instead of the viewer, who
   * may only look at it unless `editableUntil` grants correction rights.
   */
  handedOver?: boolean;
  /** The school's today, "YYYY-MM-DD", to tell a later day's lesson apart. */
  today?: string;
  timeZone?: string;
}): ReactElement | null {
  const t = useTranslations("app.attendance.session");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();
  const canManageSettings = useCan("manage_settings");

  if (handedOver && editableUntil === undefined) {
    return (
      <Alert tone="info" title={t("handedOverTitle")}>
        {t("handedOverBody")}
      </Alert>
    );
  }
  if (windowEnded || closedCode !== null) {
    // A reader who sets the school's correction window is pointed at the
    // setting itself, not told to ask the admin they are.
    const time = editableUntil ? formatDateTime(editableUntil, { locale, timeZone }) : "";
    return (
      <Alert
        tone="warning"
        title={t("closedTitle")}
        action={
          canManageSettings ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={ATTENDANCE_SETTINGS_HREF}>{t("closedSettingsLink")}</Link>
            </Button>
          ) : undefined
        }
      >
        {windowEnded && editableUntil
          ? t(canManageSettings ? "closedBodyManager" : "closedBody", { time })
          : apiErrorMessage(closedCode ?? "ATTENDANCE_WINDOW_CLOSED")}
      </Alert>
    );
  }
  if (notStartedYet && startsAt) {
    const time = formatTime(startsAt, { locale, timeZone });
    const day = formatWeekdayDate(startsAt, { locale, timeZone });
    const laterDay =
      today !== undefined && isoToZonedLocal(startsAt, timeZone).slice(0, 10) > today;
    return (
      <Alert tone="info" title={t("notStartedTitle")}>
        {laterDay ? t("notStartedBodyOnDay", { day, time }) : t("notStartedBody", { time })}
      </Alert>
    );
  }
  if (handedOver) {
    return (
      <Alert tone="info" title={t("handedOverTitle")}>
        {t("handedOverCorrectionBody")}
      </Alert>
    );
  }
  return null;
}

/**
 * An unsaved draft this browser kept from before a reload or a dropped
 * connection, offered back once with when it was last edited.
 */
export function SessionDraftOffer({
  savedAt,
  timeZone,
  onDismiss,
  onRestore,
}: {
  savedAt: string;
  timeZone?: string;
  onDismiss: () => void;
  onRestore: () => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  const locale = useLocale() as Locale;
  return (
    <Alert
      variant="warning"
      title={t("draftFoundTitle")}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onDismiss}>
            {t("draftDismiss")}
          </Button>
          <Button size="sm" onClick={onRestore}>
            {t("draftRestore")}
          </Button>
        </div>
      }
    >
      {t("draftFoundBody", { time: formatTime(savedAt, { locale, timeZone }) })}
    </Alert>
  );
}
