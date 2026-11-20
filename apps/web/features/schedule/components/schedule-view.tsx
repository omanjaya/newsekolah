"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, EmptyState, SkeletonList, domainIcons, useMediaQuery } from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { formatCalendarDateRange } from "../../../lib/format-calendar-date";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { isoWeekdayOf } from "../../../lib/tenant-date";
import { usePeriodTodayQuery } from "../../academic/api-enrollment";
import {
  useClassesQuery,
  useLookup,
  usePeriodsQuery,
  useSchoolDaysQuery,
  useSubjectsQuery,
} from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { type ScheduleBlock, useScheduleYearQuery, useSchedulesQuery } from "../api";
import { needsEffectiveDate } from "../block-policy";
import { useNamedConflict } from "../use-named-conflict";
import { usePasteBlock } from "../use-paste-block";
import { useScheduleDates } from "../use-schedule-dates";
import { cellDate, inWeek } from "../week";

import { CopyBanner } from "./copy-banner";
import { ScheduleDayGrid } from "./schedule-day-grid";
import { ScheduleDeleteDialogs } from "./schedule-delete-dialogs";
import { type EditorDates, ScheduleDialogs } from "./schedule-dialogs";
import { ScheduleMobileAgenda } from "./schedule-mobile-agenda";
import { ScheduleMobileDayList } from "./schedule-mobile-day-list";
import { type ScheduleMode, ScheduleScopeBar } from "./schedule-scope-bar";
import { ScheduleWeekGrid } from "./schedule-week-grid";
import { useScheduleHeader } from "./use-schedule-header";

type Mode = ScheduleMode;

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Weekly timetable: rows are lesson periods, columns are school days, a
 * block spans its start to end period. Viewable by class or by teacher;
 * teachers land on their own timetable.
 *
 * The timetable is effective-dated: a lesson can change from a date on
 * while every earlier lesson keeps the attendance recorded for it. So the
 * view always shows one chosen week (one chosen date in the day view), each
 * day the lessons in effect on its own date, and an edit or a removal of a
 * lesson with history asks from which date it takes effect.
 */
export function ScheduleView(): ReactElement {
  const t = useTranslations("app.schedule");
  const tDays = useTranslations("app.common.weekdays");
  const { me } = useSession();
  const year = useActiveYear();
  const canManage = useCan("manage_schedules");
  const isTeacher = me?.roles.some((role) => role.slug === "teacher") ?? false;
  // Mirrors the API's view scope: these permissions read every timetable;
  // without them a teacher reads their own lessons and a student only
  // their own class, so the pickers offer nothing the server would refuse.
  const canViewAll =
    canManage ||
    (me?.permissions.some((p) => p === "view_reports" || p === "manage_attendance") ?? false);
  const isStudent = !canViewAll && me?.profile_kind === "student";
  const apiErrorMessage = useApiErrorMessage();

  const format = useFormatter();
  const [mode, setMode] = useState<Mode>(isTeacher ? "teacher" : "class");
  const schoolDays = useSchoolDaysQuery();
  // The school's open weekdays, empty until known: the day view opens on
  // and steps between them.
  const openDays = useMemo(
    () => (schoolDays.data?.data ?? []).filter((d) => d.is_active).map((d) => d.day_of_week),
    [schoolDays.data],
  );
  const {
    today: todayIso,
    dayDate,
    weekOf,
    dayOfWeek: dayFilter,
    setDayDate,
    setWeekOf,
    stepDay,
    normalizeDay,
  } = useScheduleDates(me?.tenant.timezone, openDays);
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState(isTeacher ? (me?.id ?? "") : "");
  const [creating, setCreating] = useState<{ day: number; startSeq: number } | null>(null);
  const [editing, setEditing] = useState<ScheduleBlock | null>(null);
  // A timetable is built by repetition: the same teacher takes the same
  // subject to the same class several times a week. Copying a lesson once
  // and dropping it into empty slots is what the old system got right and
  // what makes filling a week bearable.
  const [copied, setCopied] = useState<ScheduleBlock | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScheduleBlock | null>(null);
  // A block with history is removed from a date on, through its own dialog.
  const [retiring, setRetiring] = useState<ScheduleBlock | null>(null);
  const [mobileDayOverride, setMobileDayOverride] = useState<number | null>(null);

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const periods = usePeriodsQuery();
  // Ties the "period in session now" strip above the grid to the grid
  // itself, so the reader does not have to match a time by eye.
  const periodNow = usePeriodTodayQuery(year.id);
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  // The year's dates bound every "Berlaku mulai" and the week stepper.
  const yearSpan = useScheduleYearQuery(year.id, canManage);
  const yearStart = yearSpan.data?.starts_on;
  const yearEnd = yearSpan.data?.ends_on;

  // A student reads only their own class's timetable; /v1/me names it.
  const effectiveClassId =
    mode !== "class"
      ? ""
      : isStudent
        ? (me.current_class?.id ?? "")
        : classId || (classes.data?.data[0]?.id ?? "");
  const effectiveTeacherId = mode === "teacher" ? (canViewAll ? teacherId : (me?.id ?? "")) : "";
  const schedules = useSchedulesQuery({
    academicYearId: year.id,
    classId: mode === "day" ? undefined : effectiveClassId || undefined,
    teacherUserId: mode === "day" ? undefined : effectiveTeacherId || undefined,
    dayOfWeek: mode === "day" ? dayFilter : undefined,
    allClasses: mode === "day",
    asOf: mode === "day" ? dayDate : weekOf,
  });
  // The week the server resolved (it keeps the week inside the year).
  const weekStart = schedules.data?.week_starts_on ?? weekOf;
  const editorDates: EditorDates = { today: todayIso, weekStart, yearStart, yearEnd };
  const teacherMap = useDirectoryNames(
    (schedules.data?.data ?? []).map((block) => block.teacher_user_id),
  );
  const namedConflict = useNamedConflict();

  const activeDays = useMemo(() => {
    const days = WEEKDAYS.filter((d) => openDays.includes(d));
    return days.length > 0 ? days : [1, 2, 3, 4, 5];
  }, [openDays]);

  const lessonPeriods = useMemo(() => periods.data?.data ?? [], [periods.data]);

  // Mounted grids used to receive a `.find()` closure re-built every
  // render, scanning every block for every cell. Both lookups instead key
  // one entry per period a block spans, so a cell gets its block in O(1)
  // and the Map itself keeps a stable identity across renders that do not
  // touch the schedule data.
  /** The day view keys by class instead of by weekday. */
  const classSeqBlocks = useMemo(() => {
    const map = new Map<string, ScheduleBlock>();
    for (const block of schedules.data?.data ?? []) {
      for (let seq = block.start_seq; seq <= block.end_seq; seq += 1) {
        map.set(`${block.class_id}:${seq}`, block);
      }
    }
    return map;
  }, [schedules.data]);

  const daySeqBlocks = useMemo(() => {
    const map = new Map<string, ScheduleBlock>();
    for (const block of schedules.data?.data ?? []) {
      for (let seq = block.start_seq; seq <= block.end_seq; seq += 1) {
        map.set(`${block.day_of_week}:${seq}`, block);
      }
    }
    return map;
  }, [schedules.data]);

  /**
   * A clash names what it clashed with when the server said which, and
   * falls back to the plain message for that code when it did not.
   */
  async function scheduleError(err: unknown): Promise<string> {
    const named = await namedConflict(
      err,
      { classMap, subjectMap, teacherMap, periods: lessonPeriods },
      t,
    );
    if (named) return named;
    return err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN");
  }

  const { pasteInto } = usePasteBlock({
    copied,
    lessonPeriods,
    yearId: year.id,
    dates: editorDates,
    describeError: scheduleError,
  });

  // Below md the day view and the class/teacher views each mount one of a
  // mobile list and a desktop grid instead of mounting both and hiding
  // one with CSS, so day mode no longer keeps three full grids in the DOM
  // at once.
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // The phone agenda opens on today when the school meets today, because
  // "what do I teach now" is the question a teacher opens it with. In any
  // other week no day is today.
  const today = inWeek(weekStart, todayIso) ? isoWeekdayOf(todayIso) : 0;
  const mobileDay =
    mobileDayOverride ?? (activeDays.includes(today) ? today : (activeDays[0] ?? 1));
  const loading = periods.isLoading || schedules.isLoading || classes.isLoading;
  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  function handleDayAdd(cls: string, startSeq: number) {
    setClassId(cls);
    setCreating({ day: dayFilter, startSeq });
  }

  function handleDayPaste(cls: string, startSeq: number) {
    void pasteInto(dayFilter, startSeq, cls);
  }

  function handleWeekAdd(day: number, startSeq: number) {
    setCreating({ day, startSeq });
  }

  function handleWeekPaste(day: number, startSeq: number) {
    void pasteInto(day, startSeq);
  }

  /** A block with history is removed from a date on; any other goes entirely. */
  function requestDelete(block: ScheduleBlock) {
    if (needsEffectiveDate(block)) {
      setRetiring(block);
      return;
    }
    setPendingDelete(block);
  }

  /** "Matematika, X-A, Senin": the lesson the retire dialog names. */
  function lessonName(block: ScheduleBlock): string {
    return [
      subjectMap.get(block.subject_id)?.name ?? t("unknownSubject"),
      classMap.get(block.class_id)?.name ?? t("unknownClass"),
      tDays(String(block.day_of_week)),
    ].join(", ");
  }

  const { primaryAction, primaryActionCompact, secondaryActions, context } = useScheduleHeader({
    canManage,
    isStudent,
    className: classMap.get(effectiveClassId)?.name,
    yearLabel: year.label,
    onAdd: () => {
      setCreating({ day: activeDays[0] ?? 1, startSeq: lessonPeriods[0]?.sequence ?? 1 });
    },
  });

  const ownEmptyWeek =
    !canManage &&
    mode === "teacher" &&
    effectiveTeacherId === me?.id &&
    !schedules.isLoading &&
    (schedules.data?.data.length ?? 0) === 0;

  return (
    <AppPage
      // The week grid fills the screen on desktop and scrolls under its
      // day headings; a phone scrolls the agenda as a page.
      variant="fit"
      primaryAction={primaryAction}
      primaryActionCompact={primaryActionCompact}
      secondaryActions={secondaryActions}
      // The year and the period in session sit in the toolbar, not under
      // the title, so the header keeps the height of its sibling tabs.
      toolbar={
        <>
          <ScheduleScopeBar
            mode={mode}
            onModeChange={setMode}
            isStudent={isStudent}
            ownTimetableOnly={isTeacher && !canViewAll}
            canViewAll={canViewAll}
            dates={{
              weekOf: weekStart,
              onWeekOfChange: setWeekOf,
              dayDate,
              onDayDateChange: setDayDate,
              today: todayIso,
              weekLabel: formatCalendarDateRange(format, weekStart, cellDate(weekStart, 7)),
              yearStart,
              yearEnd,
              stepDay,
              normalizeDay,
            }}
            classOptions={classOptions}
            classId={effectiveClassId}
            onClassChange={setClassId}
            teacherId={effectiveTeacherId}
            onTeacherChange={setTeacherId}
          />
          {context}
        </>
      }
    >
      <CopyBanner
        copied={copied}
        subjectMap={subjectMap}
        classMap={classMap}
        onCancel={() => {
          setCopied(null);
        }}
        t={t}
      />

      {loading ? (
        <SkeletonList rows={6} />
      ) : schedules.isError ? (
        <QueryError retry={schedules.refetch} error={schedules.error} />
      ) : isStudent && !effectiveClassId ? (
        <EmptyState
          icon={<domainIcons.schedule aria-hidden="true" />}
          title={t("noClassTitle")}
          description={t("noClassBody")}
        />
      ) : lessonPeriods.length === 0 ? (
        <EmptyState
          icon={<domainIcons.schedule aria-hidden="true" />}
          title={t("noPeriodsTitle")}
          description={t("noPeriodsBody")}
        />
      ) : ownEmptyWeek ? (
        // A week of empty cells says nothing; say whose week it is and
        // where the timetables are instead.
        <EmptyState
          icon={<domainIcons.schedule aria-hidden="true" />}
          title={t("noTeachingTitle")}
          description={t("noTeachingBody")}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setMode("class");
              }}
            >
              {t("viewByClass")}
            </Button>
          }
        />
      ) : /* Below md, a 7-column-by-N-row grid has no honest reflow: it either
             collapses columns to slivers or forces sideways scroll through the
             whole week, so mobile gets its own view instead of a shrunk table.
             Exactly one of the mobile and desktop layouts mounts, matching the
             viewport, instead of mounting both and hiding one with CSS. */
      mode === "day" ? (
        isDesktop ? (
          <ScheduleDayGrid
            classes={classes.data?.data ?? []}
            lessonPeriods={lessonPeriods}
            blocks={classSeqBlocks}
            teacherMap={teacherMap}
            subjectMap={subjectMap}
            canManage={canManage}
            copied={copied}
            onAdd={handleDayAdd}
            onPaste={handleDayPaste}
            onCopy={setCopied}
            onEdit={setEditing}
            onDelete={requestDelete}
            t={t}
            currentSeq={dayDate === todayIso ? periodNow.data?.sequence : undefined}
            weekStart={weekStart}
          />
        ) : (
          <ScheduleMobileDayList
            classes={classes.data?.data ?? []}
            lessonPeriods={lessonPeriods}
            blocks={classSeqBlocks}
            teacherMap={teacherMap}
            subjectMap={subjectMap}
            canManage={canManage}
            copied={copied}
            onAdd={handleDayAdd}
            onPaste={handleDayPaste}
            onCopy={setCopied}
            onEdit={setEditing}
            onDelete={requestDelete}
            t={t}
          />
        )
      ) : isDesktop ? (
        <ScheduleWeekGrid
          weekStart={weekStart}
          activeDays={activeDays}
          lessonPeriods={lessonPeriods}
          blocks={daySeqBlocks}
          mode={mode === "teacher" ? "teacher" : "class"}
          teacherMap={teacherMap}
          classMap={classMap}
          subjectMap={subjectMap}
          canManage={canManage}
          copied={copied}
          onAdd={handleWeekAdd}
          onPaste={handleWeekPaste}
          onCopy={setCopied}
          onEdit={setEditing}
          onDelete={requestDelete}
          t={t}
          tDays={tDays}
          currentSeq={periodNow.data?.sequence}
        />
      ) : (
        // Outside the day view the agenda answers the same question a day
        // at a time, which is the readable shape on a phone.
        <ScheduleMobileAgenda
          weekStart={weekStart}
          activeDays={activeDays}
          lessonPeriods={lessonPeriods}
          blocks={daySeqBlocks}
          mode={mode === "teacher" ? "teacher" : "class"}
          teacherMap={teacherMap}
          classMap={classMap}
          subjectMap={subjectMap}
          canManage={canManage}
          mobileDay={mobileDay}
          onSelectDay={setMobileDayOverride}
          onAdd={handleWeekAdd}
          onPaste={handleWeekPaste}
          onCopy={setCopied}
          onEdit={setEditing}
          onDelete={requestDelete}
          copied={copied}
          today={today}
          currentSeq={periodNow.data?.sequence}
          t={t}
          tDays={tDays}
        />
      )}

      <ScheduleDialogs
        year={year}
        creating={creating}
        editing={editing}
        effectiveClassId={effectiveClassId}
        effectiveTeacherId={effectiveTeacherId}
        canManage={canManage}
        dates={editorDates}
        onCloseCreate={() => {
          setCreating(null);
        }}
        onCloseEdit={() => {
          setEditing(null);
        }}
        t={t}
      />

      <ScheduleDeleteDialogs
        pendingDelete={pendingDelete}
        onCloseDelete={() => {
          setPendingDelete(null);
        }}
        retiring={retiring}
        onCloseRetire={() => {
          setRetiring(null);
        }}
        lessonName={lessonName}
        dates={editorDates}
      />
    </AppPage>
  );
}
