"use client";

import type { components } from "@newsekolah/api-client";
import { Card, CardHeader, CardTitle, Skeleton } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";

type AdminDashboard = components["schemas"]["AdminDashboard"];

const MONITOR_HREF = "/monitor";

/** School-wide attendance today (sessions with attendance taken vs. total), linking to the monitor. */
export function PresenceCard({
  isLoading,
  isError,
  refetch,
  attendance,
}: {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  attendance: AdminDashboard["attendance_today"] | undefined;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.leadership.presence");
  const percent =
    attendance && attendance.total > 0
      ? Math.round((attendance.submitted / attendance.total) * 100)
      : 0;
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t("title")}</CardTitle>
        <Link
          href={MONITOR_HREF}
          className="shrink-0 text-[13px] text-accent underline underline-offset-2"
        >
          {t("open")}
        </Link>
      </CardHeader>
      <div className="flex flex-col gap-3 px-5 pb-5">
        {isError ? (
          <QueryError retry={refetch} />
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        ) : !attendance || attendance.total === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("empty")}</p>
        ) : (
          <>
            <p className="text-[28px] font-semibold tabular-nums text-fg">{percent}%</p>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-bg"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("title")}
            >
              <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-[13px] text-fg">
              {t("summary", { submitted: attendance.submitted, total: attendance.total })}
            </p>
            <p className="text-[13px] text-fg-muted">
              {t("pending", { pending: attendance.total - attendance.submitted })}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
