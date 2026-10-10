"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Badge, Skeleton } from "@newsekolah/ui";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDisplayName } from "../../../lib/text/format-name";
import { useExitPermitReviewQueueQuery, useLeaveReviewQueueQuery } from "../../permits/api";

/**
 * Pending leave requests and exit permits for the students of one
 * homeroom class. Both review queues are scoped to the caller's own
 * approval stage by the API; this narrows them to the class by `class_id`.
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[14px] font-medium text-fg">{t("pendingLeaveTitle")}</h2>
        {leaveQueue.isLoading ? (
          <Skeleton className="h-16 w-full" aria-busy="true" />
        ) : leave.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("pendingLeaveEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {leave.map((item) => (
              <li key={item.instance_id}>
                <Link
                  href={`/leave-requests/${item.instance_id}`}
                  className="flex items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] text-fg">
                      {formatDisplayName(item.student_name)}
                    </span>
                    <span className="text-[12px] text-fg-muted">
                      {formatDate(item.starts_on, { locale, timeZone })} -{" "}
                      {formatDate(item.ends_on, { locale, timeZone })}
                    </span>
                  </div>
                  <Badge variant="accent">{t("pendingLeaveReview")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[14px] font-medium text-fg">{t("exitPermitsTitle")}</h2>
        {exitQueue.isLoading ? (
          <Skeleton className="h-16 w-full" aria-busy="true" />
        ) : exits.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("exitPermitsEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {exits.map((item) => (
              <li key={item.instance_id}>
                <Link
                  href="/exit-permits"
                  className="flex items-center justify-between gap-2 py-2 hover:text-accent"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] text-fg">
                      {formatDisplayName(item.student_name ?? "")}
                    </span>
                    <span className="truncate text-[12px] text-fg-muted">{item.destination}</span>
                  </div>
                  <Badge variant="accent">{t("pendingLeaveReview")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
