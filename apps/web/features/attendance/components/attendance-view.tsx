"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useClassesQuery, useLookup, usePeriodsQuery, useSubjectsQuery } from "../../reference/api";
import {
  type SessionSummary,
  todayInZone,
  useOpenSessionMutation,
  useTodaySessionsQuery,
} from "../api";

import { AttendanceCalendar } from "./attendance-calendar";

/** Teachers see today's sessions to fill; everyone else sees their own calendar. */
export function AttendanceView(): ReactElement {
  const t = useTranslations("app.attendance");
  const canManage = useCan("manage_attendance");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {canManage ? <TodaySessions /> : <AttendanceCalendar />}
    </div>
  );
}

function TodaySessions(): ReactElement {
  const t = useTranslations("app.attendance");
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const sessions = useTodaySessionsQuery();
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const periods = usePeriodsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const periodMap = useLookup(periods.data?.data);
  const open = useOpenSessionMutation();

  async function openSession(session: SessionSummary) {
    try {
      const detail = await open.mutateAsync({
        schedule_id: session.schedule_id,
        date: session.date || todayInZone(me?.tenant.timezone),
      });
      router.push(`/attendance/${detail.id}`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  if (sessions.isLoading) {
    return <Skeleton className="h-40 w-full" aria-busy="true" />;
  }
  const items = sessions.data?.data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<domainIcons.attendance aria-hidden="true" />}
        title={t("todayEmptyTitle")}
        description={t("todayEmptyBody")}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-medium text-fg">{t("todayTitle")}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((session) => {
          const start = periodMap.get(session.start_period_id);
          const end = periodMap.get(session.end_period_id);
          const submitted = Boolean(session.submitted_at);
          return (
            <li
              key={session.schedule_id}
              className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-medium text-fg">
                    {classMap.get(session.class_id)?.name ?? t("unknownClass")}
                  </span>
                  <span className="text-[14px] text-fg-muted">
                    {subjectMap.get(session.subject_id)?.name ?? t("unknownSubject")}
                  </span>
                  {session.is_substitute && <Badge variant="accent">{t("substituteBadge")}</Badge>}
                </div>
                <span className="text-[13px] text-fg-muted">
                  {start && end
                    ? `${start.name} - ${end.name} (${start.starts_at.slice(0, 5)}-${end.ends_at.slice(0, 5)})`
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={submitted ? "accent" : "neutral"}>
                  {submitted ? t("statusSubmitted") : t("statusPending")}
                </Badge>
                <Button
                  size="sm"
                  variant={submitted ? "secondary" : "primary"}
                  loading={open.isPending && open.variables.schedule_id === session.schedule_id}
                  onClick={() => void openSession(session)}
                >
                  {submitted ? t("openSubmitted") : t("fillAttendance")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
