"use client";

import { Button, EmptyState, Skeleton, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import {
  currentMonth,
  type LinkedChild,
  useChildAttendanceQuery,
  useMyChildrenQuery,
} from "../../family/api";

import { SectionCard } from "./section-card";

function today(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Each linked child is fetched independently so one unavailable record does not hide the others. */
export function ParentChildSummary({ timeZone }: { timeZone: string }): ReactElement {
  const t = useTranslations("app.dashboardPersona.parentSummary");
  const children = useMyChildrenQuery();
  const rows = children.data?.data ?? [];

  return (
    <SectionCard
      title={t("title")}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/children">{t("open")}</Link>
        </Button>
      }
    >
      {children.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : children.isError ? (
        <QueryError retry={children.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((child) => (
            <ParentChildAttendanceRow
              key={child.student_user_id}
              child={child}
              timeZone={timeZone}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function ParentChildAttendanceRow({
  child,
  timeZone,
}: {
  child: LinkedChild;
  timeZone: string;
}): ReactElement {
  const t = useTranslations("app.dashboardPersona.parentSummary");
  const attendance = useChildAttendanceQuery(child.student_user_id, currentMonth());
  const day = attendance.data?.data.find((item) => item.date === today(timeZone));

  return (
    <li className="flex flex-col gap-1 py-2 text-[13px]">
      <span className="font-medium text-fg">{child.student_name}</span>
      {attendance.isLoading ? (
        <Skeleton className="h-4 w-48" />
      ) : attendance.isError ? (
        <div className="flex items-center gap-2 text-fg-muted">
          <span>{t("loadError")}</span>
          <Button size="sm" variant="ghost" onClick={() => void attendance.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : day ? (
        <span className="text-fg-muted">
          {t("today", {
            status: day.status_code,
            submitted: day.submitted_sessions,
            expected: day.expected_sessions,
          })}
        </span>
      ) : (
        <span className="text-fg-muted">{t("noAttendanceToday")}</span>
      )}
    </li>
  );
}
