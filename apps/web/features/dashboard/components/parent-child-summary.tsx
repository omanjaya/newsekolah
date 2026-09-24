"use client";

import { Avatar, Button, EmptyState, Skeleton, StatusBadge, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { statusToken } from "../../../lib/attendance-status";
import { formatDisplayName } from "../../../lib/text/format-name";
import {
  currentMonth,
  type LinkedChild,
  todayInZone,
  useChildAttendanceQuery,
  useMyChildrenQuery,
} from "../../family/api";

import { SectionCard } from "./section-card";

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
            <li key={child.student_user_id}>
              <ParentChildAttendanceRow child={child} timeZone={timeZone} />
            </li>
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
  const tCodes = useTranslations("app.family.myChildren.attendance.codes");
  const attendance = useChildAttendanceQuery(child.student_user_id, currentMonth());
  const day = attendance.data?.data.find((item) => item.date === todayInZone(timeZone));
  const name = formatDisplayName(child.student_name);
  const token = day ? statusToken(day.status_code) : undefined;

  return (
    <Link
      href={`/children?child=${child.student_user_id}`}
      className="-mx-2 flex items-center gap-3 rounded-xs px-2 py-2 hover:bg-bg"
    >
      <Avatar name={name} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
        <span className="truncate font-medium text-fg">{name}</span>
        {attendance.isLoading ? (
          <Skeleton className="h-4 w-32" />
        ) : attendance.isError ? (
          // No inline retry here: a <button> would nest inside this row's
          // own <Link>, which is invalid HTML and confuses assistive tech.
          // The child's own screen (this row's destination) has a real
          // retry button instead.
          <span className="text-fg-muted">{t("loadError")}</span>
        ) : day && token ? (
          <span className="flex items-center gap-2 text-fg-muted">
            <StatusBadge status={token} label={tCodes(day.status_code)} />
            <span>
              {t("sessionsRecorded", {
                submitted: day.submitted_sessions,
                expected: day.expected_sessions,
              })}
            </span>
          </span>
        ) : (
          <span className="text-fg-muted">{t("noAttendanceToday")}</span>
        )}
      </div>
    </Link>
  );
}
