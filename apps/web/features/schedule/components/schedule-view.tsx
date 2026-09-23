"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Skeleton,
  domainIcons,
  useMediaQuery,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { usePeriodTodayQuery } from "../../academic/api-enrollment";
import { TodayPeriodBanner } from "../../academic/components/today-period-banner";
import {
  useClassesQuery,
  useLookup,
  usePeriodsQuery,
  useSchoolDaysQuery,
  useSubjectsQuery,
  useTeachersQuery,
} from "../../reference/api";
import {
  type ScheduleBlock,
  useCreateScheduleMutation,
  useDeleteScheduleBlockMutation,
  useSchedulesQuery,
} from "../api";
import { conflictMessage } from "../conflict-message";

import { CopyBanner } from "./copy-banner";
import { ScheduleDayGrid } from "./schedule-day-grid";
import { ScheduleDialogs } from "./schedule-dialogs";
import { ScheduleMobileAgenda } from "./schedule-mobile-agenda";
import { ScheduleMobileDayList } from "./schedule-mobile-day-list";
import { type ScheduleMode, ScheduleScopeBar } from "./schedule-scope-bar";
import { ScheduleWeekGrid } from "./schedule-week-grid";

type Mode = ScheduleMode;

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** 1 (Monday) through 7 (Sunday), matching the schedule's own numbering. */
function todayOfWeek(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Weekly timetable: rows are lesson periods, columns are school days, a
 * block spans its start to end period. Viewable by class or by teacher;
 * teachers land on their own timetable.
 */
export function ScheduleView(): ReactElement {
  const t = useTranslations("app.schedule");
  const tDays = useTranslations("app.common.weekdays");
  const tApp = useTranslations("app");
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
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [mode, setMode] = useState<Mode>(isTeacher ? "teacher" : "class");
  // The day view opens on today, because that is the day a person almost
  // always came to look at.
  const [dayFilter, setDayFilter] = useState<number>(todayOfWeek);
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
  const [mobileDayOverride, setMobileDayOverride] = useState<number | null>(null);

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const teachers = useTeachersQuery();
  const periods = usePeriodsQuery();
  const schoolDays = useSchoolDaysQuery();
  // Ties the "period in session now" strip above the grid to the grid
  // itself, so the reader does not have to match a time by eye.
  const periodNow = usePeriodTodayQuery(year.id);
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const teacherMap = useLookup(teachers.data?.data);
  const remove = useDeleteScheduleBlockMutation();
  const create = useCreateScheduleMutation();

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
  });

  const activeDays = useMemo(() => {
    const active = new Set(
      (schoolDays.data?.data ?? []).filter((d) => d.is_active).map((d) => d.day_of_week),
    );
    const days = WEEKDAYS.filter((d) => active.has(d));
    return days.length > 0 ? days : [1, 2, 3, 4, 5];
  }, [schoolDays.data]);

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
   * Drops the copied lesson into an empty slot, keeping its class,
   * subject, teacher and length, and moving only where it sits. The
   * server refuses a clash, so a paste onto a busy teacher comes back as
   * its own error rather than being guessed at here.
   */
  async function pasteInto(day: number, startSeq: number, intoClassId?: string) {
    if (!copied) return;
    const span = copied.end_seq - copied.start_seq;
    const start = lessonPeriods.find((p) => p.sequence === startSeq);
    // A lesson does not run through a break, so a paste that would reach
    // past one is refused rather than quietly drawn over it.
    const crossesBreak = lessonPeriods.some(
      (p) => p.is_break && p.sequence > startSeq && p.sequence <= startSeq + span,
    );
    const end = lessonPeriods.find((p) => p.sequence === startSeq + span);
    if (!start || !end || crossesBreak) {
      toast.error(t("pasteNoRoom"));
      return;
    }
    try {
      await create.mutateAsync({
        academic_year_id: year.id,
        class_id: intoClassId ?? copied.class_id,
        subject_id: copied.subject_id,
        teacher_user_id: copied.teacher_user_id,
        day_of_week: day,
        start_period_id: start.id,
        end_period_id: end.id,
        source: "admin",
      });
      toast.success(t("pasted"));
    } catch (err) {
      toast.error(scheduleError(err));
    }
  }

  /**
   * A clash names what it clashed with when the server said which, and
   * falls back to the plain message for that code when it did not.
   */
  function scheduleError(err: unknown): string {
    const named = conflictMessage(
      err,
      { classMap, subjectMap, teacherMap, periods: lessonPeriods },
      t,
    );
    if (named) return named;
    return err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN");
  }

  // Below md the day view and the class/teacher views each mount one of a
  // mobile list and a desktop grid instead of mounting both and hiding
  // one with CSS, so day mode no longer keeps three full grids in the DOM
  // at once.
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // The phone agenda opens on today when the school meets today, because
  // "what do I teach now" is the question a teacher opens it with.
  const today = todayOfWeek();
  const mobileDay =
    mobileDayOverride ?? (activeDays.includes(today) ? today : (activeDays[0] ?? 1));
  const loading = periods.isLoading || schedules.isLoading || classes.isLoading;
  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const teacherOptions = (teachers.data?.data ?? []).map((u) => ({ value: u.id, label: u.name }));

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

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.schedule_ids);
      toast.success(t("deleted"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/schedule/bulk">{t("bulk.navLink")}</Link>
              </Button>
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => {
                  setCreating({
                    day: activeDays[0] ?? 1,
                    startSeq: lessonPeriods[0]?.sequence ?? 1,
                  });
                }}
              >
                {t("addBlock")}
              </Button>
            </div>
          )
        }
      />

      <TodayPeriodBanner />

      <ScheduleScopeBar
        mode={mode}
        onModeChange={setMode}
        isStudent={isStudent}
        ownTimetableOnly={isTeacher && !canViewAll}
        canViewAll={canViewAll}
        activeDays={activeDays}
        dayFilter={dayFilter}
        onDayFilterChange={setDayFilter}
        classOptions={classOptions}
        classId={effectiveClassId}
        className={classMap.get(effectiveClassId)?.name ?? ""}
        onClassChange={setClassId}
        teacherOptions={teacherOptions}
        teacherId={effectiveTeacherId}
        onTeacherChange={setTeacherId}
        yearLabel={year.label}
      />

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
        <Skeleton className="h-96 w-full" aria-busy="true" />
      ) : schedules.isError ? (
        <Alert variant="warning" title={t("loadError")}>
          <div className="flex flex-col items-start gap-2">
            {schedules.error instanceof ApiError && <p>{apiErrorMessage(schedules.error.code)}</p>}
            <Button
              variant="secondary"
              loading={schedules.isRefetching}
              onClick={() => {
                void schedules.refetch();
              }}
            >
              {tApp("offlinePage.retry")}
            </Button>
          </div>
        </Alert>
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
            onDelete={setPendingDelete}
            t={t}
            currentSeq={dayFilter === todayOfWeek() ? periodNow.data?.sequence : undefined}
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
            onDelete={setPendingDelete}
            t={t}
          />
        )
      ) : isDesktop ? (
        <ScheduleWeekGrid
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
          onDelete={setPendingDelete}
          t={t}
          tDays={tDays}
          currentSeq={periodNow.data?.sequence}
        />
      ) : (
        // Outside the day view the agenda answers the same question a day
        // at a time, which is the readable shape on a phone.
        <ScheduleMobileAgenda
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
          onDelete={setPendingDelete}
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
        onCloseCreate={() => {
          setCreating(null);
        }}
        onCloseEdit={() => {
          setEditing(null);
        }}
        t={t}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmBody")}
        confirmLabel={t("deleteBlock")}
        destructive
        confirming={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
