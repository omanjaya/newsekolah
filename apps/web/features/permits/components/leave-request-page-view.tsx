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

/**
 * Full-page variant of the leave request detail, opened from notifications.
 * The header says what the request is: its category as the h1 and the
 * student, class and dates under it, so the card below starts with the
 * request's progress instead of repeating them. The detail shares the
 * query, so this costs no second request.
 */
export function LeaveRequestPageView({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const { data } = useLeaveRequestQuery(id);

  return (
    <AppPage
      title={data ? t(`categories.${data.category}`) : t("detailTitle")}
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
      <Card padding="md">
        <LeaveRequestDetail id={id} layout="page" />
      </Card>
    </AppPage>
  );
}
