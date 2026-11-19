"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateRange } from "@newsekolah/i18n";
import { Badge, ListRow } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { useExitPermitReviewQueueQuery, useLeaveReviewQueueQuery } from "../../permits/api";

import { HomeroomQueueCard, readFailure } from "./homeroom-queue-card";

/**
 * Pending leave requests and exit permits for the students of one
 * homeroom class. Both review queues are scoped to the caller's own
 * approval stage by the API; this narrows them to the class by `class_id`.
 * A queue that failed to load says so in its card, never "nothing waiting".
 */
export function HomeroomPermitsTab({
  classId,
  timeZone,
}: {
  classId: string;
  timeZone?: string;
}): ReactElement {
  const t = useTranslations("app.homeroom");
  const locale = useLocale() as Locale;
  const leaveQueue = useLeaveReviewQueueQuery();
  const exitQueue = useExitPermitReviewQueueQuery();

  const leave = (leaveQueue.data?.data ?? []).filter((item) => item.class_id === classId);
  const exits = (exitQueue.data?.data ?? []).filter((item) => item.class_id === classId);
  const review = (
    <Badge tone="warning" size="sm">
      {t("pendingLeaveReview")}
    </Badge>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <HomeroomQueueCard
        title={t("pendingLeaveTitle")}
        count={leave.length}
        countTone="accent"
        loading={leaveQueue.isLoading}
        failure={readFailure(leaveQueue)}
        empty={t("pendingLeaveEmpty")}
      >
        {leave.map((item) => (
          <ListRow
            key={item.instance_id}
            title={formatDisplayName(item.student_name)}
            meta={formatDateRange(item.starts_on, item.ends_on, { locale, timeZone })}
            trailing={review}
            href={`/leave-requests/${item.instance_id}`}
          />
        ))}
      </HomeroomQueueCard>

      <HomeroomQueueCard
        title={t("exitPermitsTitle")}
        count={exits.length}
        countTone="accent"
        loading={exitQueue.isLoading}
        failure={readFailure(exitQueue)}
        empty={t("exitPermitsEmpty")}
      >
        {exits.map((item) => (
          <ListRow
            key={item.instance_id}
            title={formatDisplayName(item.student_name ?? "")}
            meta={item.destination}
            trailing={review}
            href="/exit-permits"
          />
        ))}
      </HomeroomQueueCard>
    </div>
  );
}
