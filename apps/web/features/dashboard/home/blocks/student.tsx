"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton, cn } from "@newsekolah/ui";
import { BookOpen, CalendarCheck, FileText, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, type ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import { todayInZone, useMyCalendarQuery } from "../../../attendance/api";
import { useMyGradesQuery } from "../../../grading/api";
import { LibraryTitleName } from "../../../library/components/library-title-name";
import { useMyLibraryProfileQuery } from "../../../library/me-api";
import { useMyLeaveRequestsQuery } from "../../../permits/api";
import { WorkflowStatusBadge } from "../../../permits/components/workflow-stepper";
import {
  useAllPeriodsQuery,
  useLookup,
  useSubjectsQuery,
  useTeachersQuery,
} from "../../../reference/api";
import { useSchedulesQuery } from "../../../schedule/api";
import {
  attendanceRate,
  isoWeekdayInZone,
  minutesInZone,
  parseClock,
  pickCurrentOrNext,
} from "../time";
import { EMPTY_BLOCK, HERO_PRIORITY, type PersonaBlock, type Me, type TileSpec } from "../types";

interface Lesson {
  key: string;
  start: number;
  end: number;
  startLabel: string;
  endLabel: string;
  subjectId: string;
  teacherUserId: string;
}

/**
 * The student home block: next/current lesson hero, attendance/leave/loans/grades
 * tiles, today's timetable and own leave requests on the left, active library
 * loans on the right.
 */
export function useStudentBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardStudent");
  const tLeave = useTranslations("app.permits.leave");
  const locale = useLocale() as Locale;
  const timeZone = me.tenant.timezone;
  const today = todayInZone(timeZone);
  const nowMinutes = minutesInZone(new Date(), timeZone);
  const dayOfWeek = isoWeekdayInZone(new Date(), timeZone);

  const schedules = useSchedulesQuery({
    academicYearId: active ? (me.active_academic_year?.id ?? "") : "",
    classId: me.current_class?.id,
    dayOfWeek,
  });
  const periods = useAllPeriodsQuery(active);
  const subjects = useSubjectsQuery(active);
  const teachers = useTeachersQuery(active);
  const calendar = useMyCalendarQuery(active ? today.slice(0, 7) : "");
  const leaveRequests = useMyLeaveRequestsQuery(active);
  const grades = useMyGradesQuery(undefined, active);
  const library = useMyLibraryProfileQuery(active);

  const subjectMap = useLookup(subjects.data?.data);
  const teacherMap = useLookup(teachers.data?.data);

  const periodsBySequence = useMemo(() => {
    const map = new Map<number, { starts_at: string; ends_at: string }>();
    for (const period of periods.data?.data ?? []) map.set(period.sequence, period);
    return map;
  }, [periods.data]);

  const lessons = useMemo<Lesson[]>(() => {
    return (schedules.data?.data ?? [])
      .map((block): Lesson | null => {
        const start = periodsBySequence.get(block.start_seq);
        const end = periodsBySequence.get(block.end_seq);
        if (!start || !end) return null;
        return {
          key: block.schedule_ids.join("-"),
          start: parseClock(start.starts_at),
          end: parseClock(end.ends_at),
          startLabel: start.starts_at.slice(0, 5),
          endLabel: end.ends_at.slice(0, 5),
          subjectId: block.subject_id,
          teacherUserId: block.teacher_user_id,
        };
      })
      .filter((lesson): lesson is Lesson => lesson !== null);
  }, [schedules.data, periodsBySequence]);

  if (!active) return EMPTY_BLOCK;

  const scheduleReady =
    schedules.isSuccess && periods.isSuccess && subjects.isSuccess && teachers.isSuccess;
  const scheduleLoading =
    schedules.isLoading || periods.isLoading || subjects.isLoading || teachers.isLoading;
  const scheduleError =
    schedules.isError || periods.isError || subjects.isError || teachers.isError;
  const retrySchedule = () => {
    void schedules.refetch();
    void periods.refetch();
    void subjects.refetch();
    void teachers.refetch();
  };

  const currentOrNext = scheduleReady ? pickCurrentOrNext(lessons, nowMinutes) : undefined;
  const hero = currentOrNext
    ? (() => {
        const { item, state } = currentOrNext;
        const subjectName = subjectMap.get(item.subjectId)?.name ?? item.subjectId;
        const teacherName = teacherMap.get(item.teacherUserId)?.name;
        return {
          key: "student.next",
          priority: HERO_PRIORITY.studentNext,
          eyebrow: state === "now" ? t("heroNowEyebrow") : t("heroNextEyebrow"),
          title: subjectName,
          meta: [`${item.startLabel}-${item.endLabel}`, teacherName].filter(Boolean).join(" · "),
          chip: state === "next" ? `${item.start - nowMinutes} ${t("heroChipUnit")}` : undefined,
          action: { label: t("heroAction"), href: "/schedule" },
        };
      })()
    : undefined;

  const tiles: TileSpec[] = [];

  if (calendar.isSuccess) {
    const known = calendar.data.data
      .filter((day) => day.date <= today)
      .map((day) => (day.status_code === "NONE" ? null : day.status_code));
    const rate = attendanceRate(known, ["H"]);
    if (rate !== undefined) {
      tiles.push({
        key: "student.attendance",
        priority: 90,
        label: t("attendanceLabel"),
        value: `${rate}%`,
        hint: t("attendanceHint"),
        icon: CalendarCheck,
        tone: "green",
      });
    }
  }

  if (leaveRequests.isSuccess) {
    const pending = leaveRequests.data.data.filter(
      (request) => request.status === "in_progress",
    ).length;
    tiles.push({
      key: "student.leave",
      priority: 80,
      label: t("leaveLabel"),
      value: String(pending),
      icon: FileText,
      tone: "amber",
      href: "/leave-requests",
    });
  }

  if (library.isSuccess) {
    const activeLoans = library.data.active_loans;
    const nearestDue = [...activeLoans].map((loan) => loan.due_on).sort()[0];
    tiles.push({
      key: "student.loans",
      priority: 70,
      label: t("loansLabel"),
      value: String(activeLoans.length),
      hint: nearestDue
        ? t("loansHint", { date: formatDate(nearestDue, { locale, timeZone }) })
        : undefined,
      icon: BookOpen,
      tone: "purple",
      href: "/library/me",
    });
  }

  if (grades.isSuccess) {
    tiles.push({
      key: "student.grades",
      priority: 60,
      label: t("gradesLabel"),
      value: String(grades.data.subjects.length),
      hint: t("gradesHint"),
      icon: GraduationCap,
      tone: "blue",
      href: "/my-grades",
    });
  }

  const leaveItems = [...(leaveRequests.data?.data ?? [])]
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at))
    .slice(0, 3);

  const scheduleNode: ReactElement = (
    <Card>
      <CardHeader>
        <CardTitle>{t("scheduleTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {scheduleLoading ? (
          <Skeleton className="h-20 w-full" aria-busy="true" />
        ) : scheduleError ? (
          <QueryError retry={retrySchedule} />
        ) : lessons.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("scheduleEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {lessons.map((lesson) => {
              const state =
                nowMinutes >= lesson.end ? "past" : nowMinutes >= lesson.start ? "now" : "future";
              const teacherName = teacherMap.get(lesson.teacherUserId)?.name;
              return (
                <li
                  key={lesson.key}
                  className="grid grid-cols-[3.25rem_1fr] items-center gap-3 py-2"
                >
                  <span
                    className={cn(
                      "text-[13px] tabular-nums",
                      state === "now" ? "text-accent font-bold" : "text-fg-muted",
                    )}
                  >
                    {lesson.startLabel}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 truncate text-[14px]",
                      state === "now"
                        ? "text-accent font-bold"
                        : state === "past"
                          ? "text-fg-muted"
                          : "text-fg",
                    )}
                  >
                    {subjectMap.get(lesson.subjectId)?.name ?? "-"}
                    {teacherName && <span className="text-fg-muted"> · {teacherName}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const leaveNode: ReactElement = (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{t("leaveTitle")}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/leave-requests">{t("leaveAction")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {leaveRequests.isLoading ? (
          <Skeleton className="h-16 w-full" aria-busy="true" />
        ) : leaveRequests.isError ? (
          <QueryError
            retry={() => {
              void leaveRequests.refetch();
            }}
          />
        ) : leaveItems.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("leaveEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {leaveItems.map((item) => (
              <li
                key={item.instance_id}
                className="flex items-center justify-between gap-2 text-[13px]"
              >
                <span className="min-w-0 truncate text-fg">
                  {tLeave(`categories.${item.category}`)}
                </span>
                <WorkflowStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const activeLoans = library.data?.active_loans ?? [];
  const libraryNode: ReactElement = (
    <Card>
      <CardHeader>
        <CardTitle>{t("libraryTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {library.isLoading ? (
          <Skeleton className="h-16 w-full" aria-busy="true" />
        ) : library.isError ? (
          <QueryError
            retry={() => {
              void library.refetch();
            }}
          />
        ) : activeLoans.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("libraryEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeLoans.map((loan) => {
              const overdue = loan.due_on < today;
              return (
                <li key={loan.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate text-fg">
                    <LibraryTitleName titleId={loan.title_id} />
                  </span>
                  <span className={cn("shrink-0", overdue ? "text-danger" : "text-fg-muted")}>
                    {formatDate(loan.due_on, { locale, timeZone })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return {
    hero,
    tiles,
    left: [
      { key: "student.schedule", node: scheduleNode },
      { key: "student.leave", node: leaveNode },
    ],
    right: [{ key: "student.library", node: libraryNode }],
  };
}
