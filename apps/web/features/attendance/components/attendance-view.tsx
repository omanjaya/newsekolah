"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  Select,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { ChevronLeft, ChevronRight, FileBarChart, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  useClassesQuery,
  useLookup,
  usePeriodsQuery,
  useSchoolDaysQuery,
  useSubjectsQuery,
} from "../../reference/api";
import { useTeacherOptionsQuery } from "../../schedule/api";
import {
  type SessionSummary,
  todayInZone,
  useOpenSessionMutation,
  useTodaySessionsQuery,
} from "../api";

import { AttendanceCalendar } from "./attendance-calendar";

/** Teachers see a day of sessions to fill; everyone else sees their own calendar. */
export function AttendanceView(): ReactElement {
  const t = useTranslations("app.attendance");
  const canManage = useCan("manage_attendance");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {canManage ? <DaySessions /> : <AttendanceCalendar />}
    </div>
  );
}

/** "YYYY-MM-DD" shifted by `delta` days, staying in UTC so DST never skips a day. */
function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** ISO weekday (1 Monday .. 7 Sunday) of a "YYYY-MM-DD" date. */
function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function DaySessions(): ReactElement {
  const t = useTranslations("app.attendance");
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const year = useActiveYear();
  const canViewReports = useCan("view_reports");
  const canViewMonitor = useCan("view_monitor_presence");

  const today = todayInZone(me?.tenant.timezone);
  const [date, setDate] = useDateFilter("date", today);
  // A teacher defaults to their own day. An administrator who does not
  // teach starts with nobody picked: calling "own today" for someone with
  // no schedule would just be another dead end, so they see a prompt
  // instead of a session list until they choose whose day to look at.
  const isTeacher = me?.roles.some((role) => role.slug === "teacher") ?? false;
  const [selectedTeacherId, setSelectedTeacherId] = useState(() =>
    isTeacher ? (me?.id ?? "") : "",
  );

  const teacherOptions = useTeacherOptionsQuery(year.id);
  const sessions = useTodaySessionsQuery(
    { date, teacherUserId: selectedTeacherId || undefined },
    selectedTeacherId !== "",
  );
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const periods = usePeriodsQuery();
  const schoolDays = useSchoolDaysQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const periodMap = useLookup(periods.data?.data);
  const open = useOpenSessionMutation();

  const viewingOther = selectedTeacherId !== "" && selectedTeacherId !== me?.id;
  const selectedTeacherName = teacherOptions.data?.data.find(
    (o) => o.id === selectedTeacherId,
  )?.name;

  const activeWeekdays = useMemo(() => {
    const active = new Set(
      (schoolDays.data?.data ?? []).filter((d) => d.is_active).map((d) => d.day_of_week),
    );
    return active.size > 0 ? active : new Set([1, 2, 3, 4, 5]);
  }, [schoolDays.data]);
  // Unknown (school-day list still loading) defaults to "is a school day"
  // so the more specific "not a school day" message never flashes wrong.
  const isSchoolDay = schoolDays.isLoading || activeWeekdays.has(isoWeekday(date));

  async function openSession(session: SessionSummary) {
    const mode = viewingOther ? "correction" : "normal";
    try {
      const detail = await open.mutateAsync({
        schedule_id: session.schedule_id,
        date: session.date || date,
        mode,
      });
      router.push(
        mode === "correction"
          ? `/attendance/${detail.id}?mode=correction`
          : `/attendance/${detail.id}`,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const teacherSelectOptions = (teacherOptions.data?.data ?? []).map((o) => ({
    value: o.id,
    label: o.id === me?.id ? t("teacherSelf", { name: o.name }) : o.name,
  }));

  const items = sessions.data?.data ?? [];
  const loading = sessions.isLoading && selectedTeacherId !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("dateLabel")}</span>
          <div className="flex items-center gap-1">
            <IconButton
              icon={<ChevronLeft />}
              aria-label={t("prevDay")}
              variant="outline"
              onClick={() => {
                setDate((d) => shiftDate(d, -1));
              }}
            />
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
              aria-label={t("dateLabel")}
              className="w-40"
            />
            <IconButton
              icon={<ChevronRight />}
              aria-label={t("nextDay")}
              variant="outline"
              onClick={() => {
                setDate((d) => shiftDate(d, 1));
              }}
            />
          </div>
        </label>
        {date !== today && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDate(today);
            }}
          >
            {t("today")}
          </Button>
        )}
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("teacherLabel")}</span>
          <Select
            options={teacherSelectOptions}
            value={selectedTeacherId}
            onValueChange={setSelectedTeacherId}
            placeholder={t("teacherPlaceholder")}
            disabled={teacherOptions.isLoading}
            aria-label={t("teacherLabel")}
            className="w-56"
          />
        </label>
      </div>

      <div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/attendance/reports">
            <FileBarChart className="size-4" aria-hidden="true" />
            {t("myReportLink")}
          </Link>
        </Button>
      </div>

      {selectedTeacherId === "" ? (
        <EmptyState
          icon={<domainIcons.attendance aria-hidden="true" />}
          title={t("pickTeacherTitle")}
          description={t("pickTeacherBody")}
          action={
            (canViewReports || canViewMonitor) && (
              <div className="flex flex-wrap justify-center gap-2">
                {canViewReports && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/attendance/reports">
                      <FileBarChart className="size-4" aria-hidden="true" />
                      {t("openReports")}
                    </Link>
                  </Button>
                )}
                {canViewMonitor && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/monitor">
                      <MonitorSmartphone className="size-4" aria-hidden="true" />
                      {t("openMonitor")}
                    </Link>
                  </Button>
                )}
              </div>
            )
          }
        />
      ) : loading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : items.length === 0 ? (
        !isSchoolDay ? (
          <EmptyState
            icon={<domainIcons.attendance aria-hidden="true" />}
            title={t("notSchoolDayTitle")}
            description={t("notSchoolDayBody")}
          />
        ) : viewingOther ? (
          <EmptyState
            icon={<domainIcons.attendance aria-hidden="true" />}
            title={t("noScheduleTitle")}
            description={t("noScheduleOtherBody", { name: selectedTeacherName ?? "" })}
          />
        ) : (
          <EmptyState
            icon={<domainIcons.attendance aria-hidden="true" />}
            title={t("noScheduleTitle")}
            description={t("noScheduleSelfBody")}
          />
        )
      ) : (
        <section className="flex flex-col gap-3">
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
                      {session.is_substitute && (
                        <Badge variant="accent">{t("substituteBadge")}</Badge>
                      )}
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
      )}
    </div>
  );
}
