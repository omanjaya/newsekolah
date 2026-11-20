"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime, formatTime } from "@newsekolah/i18n";
import { Alert, Button } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";

/**
 * Why the session cannot be saved right now, above the roster: the lesson
 * has not started yet, or this viewer's save window has closed. A closed
 * window names when it ended (the API's editable_until, on the school's
 * clock); when only the server's refusal is known, its own message.
 */
export function SessionWindowNotice({
  startsAt,
  notStartedYet,
  editableUntil,
  windowEnded,
  closedCode,
  timeZone,
}: {
  startsAt?: string;
  notStartedYet: boolean;
  editableUntil?: string;
  /** The client clock is past editableUntil. */
  windowEnded: boolean;
  /** The error code a save was refused with for its window, if any. */
  closedCode: string | null;
  timeZone?: string;
}): ReactElement | null {
  const t = useTranslations("app.attendance.session");
  const locale = useLocale() as Locale;
  const apiErrorMessage = useApiErrorMessage();

  if (windowEnded || closedCode !== null) {
    return (
      <Alert tone="warning" title={t("closedTitle")}>
        {windowEnded && editableUntil
          ? t("closedBody", { time: formatDateTime(editableUntil, { locale, timeZone }) })
          : apiErrorMessage(closedCode ?? "ATTENDANCE_WINDOW_CLOSED")}
      </Alert>
    );
  }
  if (notStartedYet && startsAt) {
    return (
      <Alert tone="info" title={t("notStartedTitle")}>
        {t("notStartedBody", { time: formatTime(startsAt, { locale, timeZone }) })}
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
