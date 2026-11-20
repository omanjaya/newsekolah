"use client";

import { formatTime, type Locale } from "@newsekolah/i18n";
import { ConfirmDialog } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * Asks before a self-service departure is recorded. The arrival button
 * turns into the departure button in the same place, so a second tap
 * would otherwise close the day seconds after it began, and only an admin
 * can undo a recorded departure. Shared by /check-in and the home card.
 */
export function DepartureConfirmDialog({
  open,
  onOpenChange,
  arrivalAt,
  timeZone,
  confirming,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arrivalAt: string | null | undefined;
  timeZone: string | undefined;
  confirming: boolean;
  onConfirm: () => void;
}): ReactElement {
  const t = useTranslations("app.staffAttendance.self");
  const locale = useLocale() as Locale;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("confirmDepartureTitle")}
      description={t("confirmDepartureBody", {
        time: arrivalAt ? formatTime(arrivalAt, { locale, timeZone }) : "–",
      })}
      confirmLabel={t("recordDeparture")}
      confirming={confirming}
      onConfirm={onConfirm}
    />
  );
}
