"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  EmptyState,
  Field,
  Select,
  SkeletonList,
  domainIcons,
  useToast,
  type PageHeaderAction,
} from "@newsekolah/ui";
import { MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { isoWeekdayOf } from "../../../lib/tenant-date";
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
import {
  AttendanceSessionHero,
  AttendanceSessionList,
  type DaySessionItem,
} from "./attendance-session-list";
import { DayStepper } from "./day-stepper";
import { SchoolAttendanceToday } from "./school-attendance-today";
import { StaffAttendanceHub } from "./staff-attendance-hub";

/** The area's pages carry the chosen day from tab to tab. */
const NAV_PARAMS = ["date"] as const;

/** Teachers fill a day of sessions; staff without teaching get a landing; students see their calendar. */
export function AttendanceView(): ReactElement {
  const canManage = useCan("manage_attendance");
  const { me } = useSession();

  if (canManage) return <DaySessions />;

  if (me?.profile_kind === "staff" || me?.profile_kind === "teacher") {
    return <StaffAttendanceHub />;
  }

  // A student's own month, with its month switcher in the page header.
  return <AttendanceCalendar />;
}

/**
 * The teacher's day: the lesson running now (or next) as the hero with its
 * one action, the day's other sessions as a list, and the day's totals on
 * one line beside the day switcher. An administrator who does not teach
 * opens on the school's progress for today instead, and picks a teacher to
 * work on their sessions.
 */
export function DaySessions(): ReactElement {
  const t = useTranslations("app.attendance");
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const year = useActiveYear();
  const canViewMonitor = useCan("view_monitor_presence");
  const canManageSchedules = useCan("manage_schedules");
  const canManageMasterData = useCan("manage_master_data");
  const canViewSchedules = useCan("view_schedules");
  const canPickAnyTeacher = canManageSchedules || canManageMasterData;

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

  // The server lists every teacher only for schedule/master-data managers.
  // Anyone else gets at most themselves (and a 403 without a teaching load,
  // a picket teacher for one), which the picker never shows, so only a
  // reader who may pick another teacher asks for the list.
  const teacherOptions = useTeacherOptionsQuery(year.id, "", canPickAnyTeacher);
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
  const isSchoolDay = schoolDays.isLoading || activeWeekdays.has(isoWeekdayOf(date));

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

  const dayItems: DaySessionItem[] = sortedItems.map((session) => {
    const fillStatus = deriveFillStatus(
      session.submitted_at,
      session.date || date,
      today,
      Boolean(session.handed_over_to_user_id),
    );
    return {
      session,
      className: classMap.get(session.class_id)?.name ?? t("unknownClass"),
      subjectName: subjectMap.get(session.subject_id)?.name ?? t("unknownSubject"),
      start: periodMap.get(session.start_period_id),
      end: periodMap.get(session.end_period_id),
      fillStatus,
      // A lesson handed to a substitute is theirs to fill, never this
      // teacher's "now" or "next" hero.
      timing:
        fillStatus === "handedOver"
          ? null
          : session.schedule_id === ongoingScheduleId
            ? "ongoing"
            : session.schedule_id === nextScheduleId
              ? "next"
              : null,
      submitting: open.isPending && open.variables.schedule_id === session.schedule_id,
    };
  });
  // The lesson running now is the hero; with none running, the next one today.
  const hero =
    dayItems.find((item) => item.timing === "ongoing") ??
    dayItems.find((item) => item.timing === "next");
  const others = dayItems.filter((item) => item !== hero);
  const savedCount = sortedItems.filter((s) => Boolean(s.submitted_at)).length;
  // A handed-over lesson is neither saved nor waiting on this teacher.
  const handedOverCount = dayItems.filter((item) => item.fillStatus === "handedOver").length;
  // Nor is a lesson on a date that has not arrived: it cannot be filled yet.
  const upcomingCount = dayItems.filter((item) => item.fillStatus === "upcoming").length;
  const holidayName = sessions.data?.holiday_name;

  // The teacher's own report is the area's "Laporan presensi" tab, so the
  // header does not offer it again.
  const secondaryActions: PageHeaderAction[] = [
    // With no teacher picked, the school's progress card below offers the
    // monitor already; the header offers it once a teacher's day is open.
    ...(canViewMonitor && selectedTeacherId !== ""
      ? [{ label: t("openMonitor"), icon: <MonitorSmartphone />, href: "/monitor" }]
      : []),
  ];

  return (
    // The day switcher, the teacher picker and the day's totals sit under
    // the area's tabs, not in the header: the header keeps one height on
    // every tab of the area, so the tab row does not move between them.
    // The tabs keep the chosen day.
    <AppPage
      secondaryActions={secondaryActions}
      navParams={NAV_PARAMS}
      toolbar={
        <>
          <DayStepper
            value={date}
            onChange={setDate}
            today={today}
            labels={{
              previous: t("prevDay"),
              next: t("nextDay"),
              today: t("today"),
              date: t("dateLabel"),
            }}
          />
          {showTeacherPicker && (
            <Field label={t("teacherLabel")} className="w-full sm:w-64">
              <Select
                options={teacherSelectOptions}
                value={selectedTeacherId}
                onValueChange={setSelectedTeacherId}
                placeholder={t("teacherPlaceholder")}
                disabled={teacherOptions.isLoading}
              />
            </Field>
          )}
          {items.length > 0 && (
            <p className="text-body-sm text-fg-muted" data-testid="attendance-day-summary">
              {t("daySummary", {
                total: sortedItems.length,
                saved: savedCount,
                pending: sortedItems.length - savedCount - handedOverCount - upcomingCount,
              })}
              {handedOverCount > 0 && ` · ${t("dayHandedOver", { count: handedOverCount })}`}
            </p>
          )}
        </>
      }
    >
      {selectedTeacherId === "" ? (
        <SchoolAttendanceToday
          hint={showTeacherPicker ? t("pickTeacherHint") : undefined}
          date={date}
          today={today}
        />
      ) : loading ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.attendance aria-hidden="true" />}
          title={
            holidayName
              ? t("holidayTitle", { name: holidayName })
              : !isSchoolDay
                ? t("notSchoolDayTitle")
                : t("noScheduleTitle")
          }
          description={
            holidayName
              ? t("holidayBody")
              : !isSchoolDay
                ? t("notSchoolDayBody")
                : viewingOther
                  ? t("noScheduleOtherBody", { name: selectedTeacherName ?? "" })
                  : t("noScheduleSelfBody")
          }
          // A day with nothing to take still has a way on: the timetable.
          action={
            canViewSchedules ? (
              <Button asChild variant="secondary">
                <Link href="/schedule">{t("openSchedule")}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {hero && (
            <AttendanceSessionHero
              item={hero}
              timeZone={me?.tenant.timezone}
              onOpen={() => void openSession(hero.session)}
            />
          )}
          {others.length > 0 && (
            <AttendanceSessionList
              title={hero ? t("otherSessions") : t("daySessions")}
              items={others}
              timeZone={me?.tenant.timezone}
              onOpen={(item) => void openSession(item.session)}
            />
          )}
        </>
      )}
    </AppPage>
  );
}
