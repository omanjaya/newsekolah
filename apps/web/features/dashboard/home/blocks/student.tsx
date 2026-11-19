"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
  TextLink,
  cn,
} from "@newsekolah/ui";
import { BookOpen, CalendarCheck, CalendarX2, FileText, GraduationCap } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useMemo, type ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import { isModuleEnabled } from "../../../../lib/modules/feature-modules";
import { quickActionHref, quickActions } from "../../../../lib/quick-actions";
import { businessNow } from "../../../../lib/simulation/clock";
import { todayInZone, useMyCalendarQuery } from "../../../attendance/api";
import { useMyGradesQuery } from "../../../grading/api";
import { useMyLibraryProfileQuery } from "../../../library/me-api";
import { useMyLeaveRequestsQuery } from "../../../permits/api";
import { useAllPeriodsQuery, useLookup, useSubjectsQuery } from "../../../reference/api";
import { useDirectoryLookup } from "../../../reference/directory-names";
import { useSchedulesQuery } from "../../../schedule/api";
import {
  LONG_WAIT_MINUTES,
  STARTING_SOON_MINUTES,
  attendanceRate,
  clockInstant,
  isoWeekdayInZone,
  minutesInZone,
  parseClock,
  pickCurrentOrNext,
  splitMinutes,
} from "../time";
import {
  EMPTY_BLOCK,
  HERO_PRIORITY,
  type HeroCandidate,
  type Me,
  type PersonaBlock,
  type TileSpec,
} from "../types";

import { StudentLeaveCard, StudentLibraryCard } from "./student-cards";

interface Lesson {
  key: string;
  start: number;
  end: number;
  startLabel: string;
  endLabel: string;
  subjectId: string;
  teacherUserId: string;
}

const SCAN_HREF = "/scan";
const SCHEDULE_HREF = "/schedule";
const LEAVE_HREF = "/leave-requests";
const LIBRARY_ME_HREF = "/library/me";
const SUBMIT_LEAVE = quickActions.find((action) => action.id === "submit-leave");
const SUBMIT_LEAVE_HREF = SUBMIT_LEAVE ? quickActionHref(SUBMIT_LEAVE) : LEAVE_HREF;

/**
 * The student home block: the lesson running or next as the hero (scan in
 * first when it is about to start), attendance, leave, loans and grades
 * tiles, today's timetable and own leave requests as the task cards, and
 * active library loans beside them.
 */
export function useStudentBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardStudent");
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const timeZone = me.tenant.timezone;
  const today = todayInZone(timeZone);
  const nowMinutes = minutesInZone(businessNow(), timeZone);
  const dayOfWeek = isoWeekdayInZone(businessNow(), timeZone);
  const clock = (value: string) =>
    format.dateTime(clockInstant(value), { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  const schedules = useSchedulesQuery({
    academicYearId: active ? (me.active_academic_year?.id ?? "") : "",
    classId: me.current_class?.id,
    dayOfWeek,
  });
  const periods = useAllPeriodsQuery(active);
  const subjects = useSubjectsQuery(active);
  const calendar = useMyCalendarQuery(active ? today.slice(0, 7) : "");
  // Each of these belongs to a module a school can switch off; a disabled
  // one is neither queried nor shown.
  const leaveOn = isModuleEnabled(me, "permits");
  const gradesOn = isModuleEnabled(me, "grading");
  const libraryOn = isModuleEnabled(me, "library");
  const leaveRequests = useMyLeaveRequestsQuery(active && leaveOn);
  const grades = useMyGradesQuery(undefined, active && gradesOn);
  const library = useMyLibraryProfileQuery(active && libraryOn);

  const subjectMap = useLookup(subjects.data?.data);

  const periodsBySequence = useMemo(() => {
    const map = new Map<number, { starts_at: string; ends_at: string }>();
    for (const period of periods.data?.data ?? []) map.set(period.sequence, period);
    return map;
  }, [periods.data]);

  const lessons = useMemo<Lesson[]>(() => {
    return (
      (schedules.data?.data ?? [])
        // The API now combines class_id and day_of_week itself, so this
        // query already comes back narrowed to today. Filter again anyway
        // as a harmless guard against a stale cached response (e.g. the
        // query firing again right as dayOfWeek rolls over at midnight).
        .filter((block) => block.day_of_week === dayOfWeek)
        .map((block): Lesson | null => {
          const start = periodsBySequence.get(block.start_seq);
          const end = periodsBySequence.get(block.end_seq);
          if (!start || !end) return null;
          return {
            key: block.schedule_ids.join("-"),
            start: parseClock(start.starts_at),
            end: parseClock(end.ends_at),
            startLabel: start.starts_at,
            endLabel: end.ends_at,
            subjectId: block.subject_id,
            teacherUserId: block.teacher_user_id,
          };
        })
        .filter((lesson): lesson is Lesson => lesson !== null)
        .sort((a, b) => a.start - b.start)
    );
  }, [schedules.data, periodsBySequence, dayOfWeek]);

  const teachers = useDirectoryLookup(
    lessons.map((lesson) => lesson.teacherUserId),
    active,
  );
  const teacherMap = teachers.names;

  if (!active) return EMPTY_BLOCK;

  const scheduleReady =
    schedules.isSuccess && periods.isSuccess && subjects.isSuccess && teachers.isSuccess;
  const scheduleLoading =
    schedules.isLoading || periods.isLoading || subjects.isLoading || teachers.isLoading;
  const scheduleError =
    schedules.error ?? periods.error ?? subjects.error ?? (teachers.isError ? true : null);
  const retrySchedule = () => {
    void schedules.refetch();
    void periods.refetch();
    void subjects.refetch();
    teachers.refetch();
  };

  const currentOrNext = scheduleReady ? pickCurrentOrNext(lessons, nowMinutes) : undefined;
  let hero: HeroCandidate | undefined;
  if (currentOrNext) {
    const { item, state } = currentOrNext;
    const subjectName = subjectMap.get(item.subjectId)?.name ?? item.subjectId;
    const teacherName = teacherMap.get(item.teacherUserId)?.name;
    const wait = item.start - nowMinutes;
    // Scanning into class is the student's task of the moment: it leads
    // while a lesson runs or is about to start; further ahead the
    // timetable does.
    const scanFirst = state === "now" || wait <= STARTING_SOON_MINUTES;
    hero = {
      key: "student.next",
      priority: HERO_PRIORITY.studentNext,
      eyebrow: state === "now" ? t("heroNowEyebrow") : t("heroNextEyebrow"),
      title: subjectName,
      meta: [`${clock(item.startLabel)}–${clock(item.endLabel)}`, teacherName]
        .filter(Boolean)
        .join(" · "),
      chip:
        state === "now"
          ? t("heroNowChip", splitMinutes(nowMinutes - item.start))
          : wait > LONG_WAIT_MINUTES
            ? t("heroChipAt", { start: clock(item.startLabel) })
            : t("heroChip", splitMinutes(wait)),
      live: state === "now",
      action: scanFirst
        ? { label: t("heroScanAction"), href: SCAN_HREF }
        : { label: t("heroAction"), href: SCHEDULE_HREF },
      ...(scanFirst ? { secondaryAction: { label: t("heroAction"), href: SCHEDULE_HREF } } : {}),
    };
  } else if (scheduleReady) {
    hero = {
      key: "student.idle",
      priority: HERO_PRIORITY.studentIdle,
      tone: "neutral",
      eyebrow: t("heroIdleEyebrow"),
      title: lessons.length > 0 ? t("heroDoneTitle") : t("heroFreeTitle"),
      meta: lessons.length > 0 ? t("heroDoneMeta") : t("heroFreeMeta"),
      action: { label: t("heroAction"), href: SCHEDULE_HREF },
    };
  }

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
        href: "/attendance",
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
      href: LEAVE_HREF,
    });
  }

  const activeLoans = library.data?.active_loans ?? [];
  if (library.isSuccess) {
    const overdue = activeLoans.filter((loan) => loan.due_on < today).length;
    const nearestDue = [...activeLoans].map((loan) => loan.due_on).sort()[0];
    tiles.push({
      key: "student.loans",
      priority: 70,
      label: t("loansLabel"),
      value: String(activeLoans.length),
      hint:
        overdue > 0
          ? t("loansOverdueHint", { count: overdue })
          : nearestDue
            ? t("loansHint", { date: formatDate(nearestDue, { locale, timeZone }) })
            : undefined,
      icon: BookOpen,
      tone: overdue > 0 ? "red" : "purple",
      href: LIBRARY_ME_HREF,
    });
  }

  if (grades.isSuccess) {
    tiles.push({
      key: "student.grades",
      priority: 60,
      label: t("gradesLabel"),
      value: String(grades.data.subjects.length),
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
      <CardHeader action={<TextLink href={SCHEDULE_HREF}>{t("scheduleAction")}</TextLink>}>
        <CardTitle as="h2">{t("scheduleTitle")}</CardTitle>
      </CardHeader>
      {scheduleLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={4} framed={false} />
        </div>
      ) : scheduleError ? (
        <div className="px-5 pb-5">
          <QueryError retry={retrySchedule} error={scheduleError} />
        </div>
      ) : lessons.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<CalendarX2 />} title={t("scheduleEmpty")} />
        </div>
      ) : (
        <List dense>
          {lessons.map((lesson) => {
            const state =
              nowMinutes >= lesson.end ? "past" : nowMinutes >= lesson.start ? "now" : "future";
            const teacherName = teacherMap.get(lesson.teacherUserId)?.name;
            return (
              <ListRow
                key={lesson.key}
                selected={state === "now"}
                leading={
                  <span
                    className={cn(
                      "w-12 text-label tabular-nums",
                      state === "now" ? "text-accent" : "text-fg-muted",
                    )}
                  >
                    {clock(lesson.startLabel)}
                  </span>
                }
                title={
                  <span className={cn(state === "past" && "text-fg-muted")}>
                    {subjectMap.get(lesson.subjectId)?.name ?? "-"}
                  </span>
                }
                meta={teacherName}
                trailing={
                  state === "now" ? (
                    <Badge tone="accent" size="sm" dot dotClassName="bg-current animate-live">
                      {t("scheduleNow")}
                    </Badge>
                  ) : undefined
                }
              />
            );
          })}
        </List>
      )}
    </Card>
  );

  const leaveNode: ReactElement = (
    <StudentLeaveCard
      query={leaveRequests}
      items={leaveItems}
      timeZone={timeZone}
      leaveHref={LEAVE_HREF}
      submitHref={SUBMIT_LEAVE_HREF}
    />
  );

  const libraryNode: ReactElement = (
    <StudentLibraryCard
      query={library}
      loans={activeLoans}
      today={today}
      timeZone={timeZone}
      libraryHref={LIBRARY_ME_HREF}
    />
  );

  return {
    hero,
    tiles,
    pending: scheduleLoading,
    main: [
      { key: "student.schedule", node: scheduleNode },
      ...(leaveOn ? [{ key: "student.leave", node: leaveNode }] : []),
    ],
    side: libraryOn ? [{ key: "student.library", node: libraryNode }] : [],
  };
}
