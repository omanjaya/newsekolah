"use client";

import type { Locale } from "@newsekolah/i18n";
import { Card } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useLeaveRequestQuery } from "../api";
import { formatDayRange } from "../lib/permit-dates";

import { LeaveRequestDetail } from "./leave-request-detail";
import { LeaveRequestNotFoundPage, isLeaveRequestMissing } from "./leave-request-not-found";

/**
 * Full-page variant of the leave request detail, opened from notifications.
 * The header says what the request is: its name as the h1 ("Izin sakit")
 * and the student, class and dates under it, so the card below starts with
 * the request's outcome and progress instead of repeating them. A short
 * record on the narrow column (720), so labels sit near their values and
 * the stepper's stages near each other. The detail shares the query, so
 * this costs no second request.
 */
export function LeaveRequestPageView({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { data, error } = useLeaveRequestQuery(id);

  // No request to open: the shared not-found page, so the tab and the
  // heading name what is missing rather than "Detail izin".
  if (!data && isLeaveRequestMissing(error)) return <LeaveRequestNotFoundPage />;

  return (
    <AppPage
      variant="narrow"
      title={data ? t("pageTitle", { category: data.category }) : t("detailTitle")}
      documentTitle={t("detailTitle")}
      description={
        data
          ? `${formatDisplayName(data.student_name)} (${data.class_name}) · ${formatDayRange(
              data.starts_on,
              data.ends_on,
              locale,
            )}`
          : undefined
      }
    >
      {/* `overflow-clip` (not `hidden`, which would end the sticky) keeps
          the decision row docked on a phone inside the card's corners. */}
      <Card padding="md" className="overflow-clip">
        <LeaveRequestDetail id={id} layout="page" />
      </Card>
    </AppPage>
  );
}
