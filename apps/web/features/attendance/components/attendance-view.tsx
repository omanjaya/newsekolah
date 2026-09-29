"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  Select,
  Skeleton,
  cn,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { ChevronLeft, ChevronRight, FileBarChart, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { bentoCells } from "../../../lib/layout/bento";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  useClassesQuery,
  useLookup,
  useAllPeriodsQuery,
  useSchoolDaysQuery,
  useSubjectsQuery,
} from "../../reference/api";
import { useTeacherOptionsQuery } from "../../schedule/api";
import {
  type SessionSummary,
  nowTimeInZone,
  todayInZone,
  useOpenSessionMutation,
  useTodaySessionsQuery,
} from "../api";
import { classifyPeriodTiming, deriveFillStatus, findNextSessionId } from "../lib/session-schedule";

import { AttendanceCalendar } from "./attendance-calendar";
import { AttendanceDayStats } from "./attendance-day-summary";
import { AttendanceSessionCard } from "./attendance-session-card";

/** Teachers see a day of sessions to fill; everyone else sees their own calendar. */
export function AttendanceView(): ReactElement {
  const canManage = useCan("manage_attendance");

  if (canManage) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <DaySessions />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* The calendar renders its own page heading and month navigator. */}
      <AttendanceCalendar />
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

/** The teacher's day of sessions: the bento header, stat tiles, and the session card grid. */
export function DaySessions(): ReactElement {
  const t = useTranslations("app.attendance");
  const format = useFormatter();
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const year = useActiveYear();
  const canViewReports = useCan("view_reports");
  const canViewMonitor = useCan("view_monitor_presence");
  const canManageSchedules = useCan("manage_schedules");
  const canManageMasterData = useCan("manage_master_data");
  const canPickAnyTeacher = canManageSchedules || canManageMasterData;

  const today = todayInZone(me?.tenant.timezone);
  const [date, setDate] = useDateFilter("date", today);
  const dateInputRef = useRef<HTMLInputElement>(null);
  // A teacher defaults to their own day. An administrator who does not
  // teach starts with nobody picked: calling "own today" for someone with
  // no schedule would just be another dead end, so they see a prompt
  // instead of a session list until they choose whose day to look at.
  const isTeacher = me?.roles.some((role) => role.slug === "teacher") ?? false;
  const [selectedTeacherId, setSelectedTeacherId] = useState(() =>
    isTeacher ? (me?.id ?? "") : "",
  );

  // The server lists every teacher only for schedule/master-data managers;
  // other teachers get just themselves, and a non-teaching user gets a 403.
  const teacherOptions = useTeacherOptionsQuery(year.id, "", canPickAnyTeacher || isTeacher);
  const sessions = useTodaySessionsQuery(
    { date, teacherUserId: selectedTeacherId || undefined },
    selectedTeacherId !== "",
  );
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  // Every period template, not only the default: a class timetabled on a
  // second template would otherwise show no time and sort first.
  const periods = useAllPeriodsQuery();
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

  // A picker holding only "me" (or nothing, for a counselor without a
  // teaching load) is noise on the phone where teachers take attendance.
  const showTeacherPicker = teacherOptions.isLoading
    ? canPickAnyTeacher
    : teacherSelectOptions.some((option) => option.value !== me?.id);

  const items = useMemo(() => sessions.data?.data ?? [], [sessions.data]);
  const loading = sessions.isLoading && selectedTeacherId !== "";

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aStart = periodMap.get(a.start_period_id)?.starts_at ?? "";
        const bStart = periodMap.get(b.start_period_id)?.starts_at ?? "";
        return aStart.localeCompare(bStart);
      }),
    [items, periodMap],
  );

  // Re-evaluated every 30s so "sedang berlangsung"/"berikutnya" stays
  // accurate through a lesson without a full page reload; only meaningful
  // for today's own list, never for a past or future date.
  const [now, setNow] = useState(() => nowTimeInZone(me?.tenant.timezone));
  useEffect(() => {
    const id = setInterval(() => {
      setNow(nowTimeInZone(me?.tenant.timezone));
    }, 30_000);
    return () => {
      clearInterval(id);
    };
  }, [me?.tenant.timezone]);
  const isToday = date === today;

  const ongoingScheduleId = useMemo(() => {
    if (!isToday) return null;
    const match = sortedItems.find((session) => {
      const start = periodMap.get(session.start_period_id);
      const end = periodMap.get(session.end_period_id);
      if (!start || !end) return false;
      return (
        classifyPeriodTiming(now, { startsAt: start.starts_at, endsAt: end.ends_at }) === "ongoing"
      );
    });
    return match?.schedule_id ?? null;
  }, [isToday, sortedItems, periodMap, now]);

  const nextScheduleId = useMemo(() => {
    if (!isToday) return null;
    // A session whose period is not in periodMap (a stale or deleted
    // period) has no timing to compare, so it is left out of "next"
    // rather than guessed at: a placeholder time could wrongly mark it
    // either always-next or never-next.
    const timed = sortedItems.filter((session) => {
      const start = periodMap.get(session.start_period_id);
      const end = periodMap.get(session.end_period_id);
      return Boolean(start && end);
    });
    return findNextSessionId(
      timed,
      (session) => session.schedule_id,
      (session) => {
        const start = periodMap.get(session.start_period_id);
        const end = periodMap.get(session.end_period_id);
        return { startsAt: start?.starts_at ?? "", endsAt: end?.ends_at ?? "" };
      },
      now,
    );
  }, [isToday, sortedItems, periodMap, now]);

  // Noon UTC so the tenant-zone weekday/day/month label never rolls to the
  // neighboring calendar date for a timezone behind or ahead of UTC.
  const dateLabel = format.dateTime(new Date(`${date}T12:00:00Z`), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: me?.tenant.timezone,
  });

  const headerActions = (
    <>
      <div className="flex items-center gap-1">
        <IconButton
          icon={<ChevronLeft />}
          aria-label={t("prevDay")}
          variant="outline"
          className="rounded-full"
          onClick={() => {
            setDate((d) => shiftDate(d, -1));
          }}
        />
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none rounded-full"
          >
            {dateLabel}
          </Button>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
            aria-label={t("dateLabel")}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <IconButton
          icon={<ChevronRight />}
          aria-label={t("nextDay")}
          variant="outline"
          className="rounded-full"
          onClick={() => {
            setDate((d) => shiftDate(d, 1));
          }}
        />
      </div>
      {date !== today && (
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => {
            setDate(today);
          }}
        >
          {t("today")}
        </Button>
      )}
      {isTeacher && (
        <Button asChild variant="secondary" size="sm" className="rounded-full">
          <Link href="/attendance/reports?tab=mine">
            <FileBarChart className="size-4" aria-hidden="true" />
            {t("myReportLink")}
          </Link>
        </Button>
      )}
      {selectedTeacherId === "" && canViewReports && (
        <Button asChild variant="secondary" size="sm" className="rounded-full">
          <Link href="/attendance/reports">
            <FileBarChart className="size-4" aria-hidden="true" />
            {t("openReports")}
          </Link>
        </Button>
      )}
      {selectedTeacherId === "" && canViewMonitor && (
        <Button asChild variant="secondary" size="sm" className="rounded-full">
          <Link href="/monitor">
            <MonitorSmartphone className="size-4" aria-hidden="true" />
            {t("openMonitor")}
          </Link>
        </Button>
      )}
    </>
  );

  const sessionCells = bentoCells(
    sortedItems.map((session) => {
      const start = periodMap.get(session.start_period_id);
      const end = periodMap.get(session.end_period_id);
      const fillStatus = deriveFillStatus(session.submitted_at, session.date || date, today);
      const timing: "ongoing" | "next" | null =
        session.schedule_id === ongoingScheduleId
          ? "ongoing"
          : session.schedule_id === nextScheduleId
            ? "next"
            : null;
      return {
        key: session.schedule_id,
        node: (
          <AttendanceSessionCard
            session={session}
            className={classMap.get(session.class_id)?.name ?? t("unknownClass")}
            subjectName={subjectMap.get(session.subject_id)?.name ?? t("unknownSubject")}
            start={start}
            end={end}
            fillStatus={fillStatus}
            timing={timing}
            submitting={open.isPending && open.variables.schedule_id === session.schedule_id}
            timeZone={me?.tenant.timezone}
            onOpen={() => void openSession(session)}
          />
        ),
      };
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} actions={headerActions} />

      {showTeacherPicker && (
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
      )}

      {selectedTeacherId === "" ? (
        <EmptyState
          icon={<domainIcons.attendance aria-hidden="true" />}
          title={t("pickTeacherTitle")}
          description={t("pickTeacherBody")}
        />
      ) : loading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Skeleton className="h-[104px] w-full" />
            <Skeleton className="h-[104px] w-full" />
            <Skeleton className="h-[104px] w-full" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
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
        <section className="flex flex-col gap-4">
          <AttendanceDayStats
            total={sortedItems.length}
            saved={sortedItems.filter((s) => Boolean(s.submitted_at)).length}
            pending={sortedItems.filter((s) => !s.submitted_at).length}
          />
          <div className="grid gap-4 lg:grid-cols-2" data-testid="attendance-session-cards">
            {sessionCells.map((cell) => (
              <div
                key={cell.key}
                data-testid={`attendance-session-cell-${cell.key}`}
                className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
              >
                <div className="flex-1">{cell.node}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
