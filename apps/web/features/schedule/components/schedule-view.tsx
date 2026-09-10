"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
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

import { BlockAction } from "./block-action";
import { CopyBanner } from "./copy-banner";
import { ScheduleDialogs } from "./schedule-dialogs";
import { ScheduleMobileAgenda } from "./schedule-mobile-agenda";

type Mode = "class" | "teacher";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Weekly timetable: rows are lesson periods, columns are school days, a
 * block spans its start to end period. Viewable by class or by teacher;
 * teachers land on their own timetable.
 */
export function ScheduleView(): ReactElement {
  const t = useTranslations("app.schedule");
  const tDays = useTranslations("app.common.weekdays");
  const { me } = useSession();
  const year = useActiveYear();
  const canManage = useCan("manage_schedules");
  const isTeacher = me?.roles.some((role) => role.slug === "teacher") ?? false;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [mode, setMode] = useState<Mode>(isTeacher ? "teacher" : "class");
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
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const teacherMap = useLookup(teachers.data?.data);
  const remove = useDeleteScheduleBlockMutation();
  const create = useCreateScheduleMutation();

  const effectiveClassId = mode === "class" ? classId || (classes.data?.data[0]?.id ?? "") : "";
  const effectiveTeacherId = mode === "teacher" ? teacherId : "";
  const schedules = useSchedulesQuery({
    academicYearId: year.id,
    classId: effectiveClassId || undefined,
    teacherUserId: effectiveTeacherId || undefined,
  });

  const activeDays = useMemo(() => {
    const active = new Set(
      (schoolDays.data?.data ?? []).filter((d) => d.is_active).map((d) => d.day_of_week),
    );
    const days = WEEKDAYS.filter((d) => active.has(d));
    return days.length > 0 ? days : [1, 2, 3, 4, 5];
  }, [schoolDays.data]);

  const lessonPeriods = useMemo(() => periods.data?.data ?? [], [periods.data]);

  const blocksByDay = useMemo(() => {
    const map = new Map<number, ScheduleBlock[]>();
    for (const block of schedules.data?.data ?? []) {
      const list = map.get(block.day_of_week) ?? [];
      list.push(block);
      map.set(block.day_of_week, list);
    }
    return map;
  }, [schedules.data]);

  /**
   * Drops the copied lesson into an empty slot, keeping its class,
   * subject, teacher and length, and moving only where it sits. The
   * server refuses a clash, so a paste onto a busy teacher comes back as
   * its own error rather than being guessed at here.
   */
  async function pasteInto(day: number, startSeq: number) {
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
        class_id: copied.class_id,
        subject_id: copied.subject_id,
        teacher_user_id: copied.teacher_user_id,
        day_of_week: day,
        start_period_id: start.id,
        end_period_id: end.id,
        source: "admin",
      });
      toast.success(t("pasted"));
    } catch (err) {
      toast.error(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  function blockAt(day: number, seq: number): ScheduleBlock | undefined {
    return blocksByDay.get(day)?.find((b) => b.start_seq <= seq && seq <= b.end_seq);
  }

  const mobileDay = mobileDayOverride ?? activeDays[0] ?? 1;
  const loading = periods.isLoading || schedules.isLoading || classes.isLoading;
  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const teacherOptions = (teachers.data?.data ?? []).map((u) => ({ value: u.id, label: u.name }));

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

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(value as Mode);
          }}
        >
          <TabsList>
            <TabsTrigger value="class">{t("byClass")}</TabsTrigger>
            <TabsTrigger value="teacher">{t("byTeacher")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "class" ? (
          <Select
            options={classOptions}
            value={effectiveClassId}
            onValueChange={setClassId}
            placeholder={t("pickClass")}
            aria-label={t("pickClass")}
            className="w-56"
          />
        ) : (
          <Select
            options={teacherOptions}
            value={effectiveTeacherId}
            onValueChange={setTeacherId}
            placeholder={t("pickTeacher")}
            aria-label={t("pickTeacher")}
            className="w-64"
          />
        )}
        <span className="text-[13px] text-fg-muted">{year.label}</span>
      </div>

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
      ) : lessonPeriods.length === 0 ? (
        <EmptyState
          icon={<domainIcons.schedule aria-hidden="true" />}
          title={t("noPeriodsTitle")}
          description={t("noPeriodsBody")}
        />
      ) : (
        <>
          {/* Below md, a 7-column-by-N-row grid has no honest reflow: it either
              collapses columns to slivers or forces sideways scroll through the
              whole week. A day-at-a-time agenda keeps every block readable with
              a thumb, so mobile gets its own view instead of a shrunk table. */}
          <ScheduleMobileAgenda
            activeDays={activeDays}
            lessonPeriods={lessonPeriods}
            blockAt={blockAt}
            mode={mode}
            teacherMap={teacherMap}
            classMap={classMap}
            subjectMap={subjectMap}
            canManage={canManage}
            mobileDay={mobileDay}
            onSelectDay={setMobileDayOverride}
            onAdd={(day, startSeq) => {
              setCreating({ day, startSeq });
            }}
            onDelete={setPendingDelete}
            t={t}
            tDays={tDays}
          />

          <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-bg text-left text-fg-muted">
                  <th scope="col" className="w-28 border-b border-border px-3 py-2 font-medium">
                    {t("periodColumn")}
                  </th>
                  {activeDays.map((day) => (
                    <th
                      key={day}
                      scope="col"
                      className="border-b border-l border-border px-3 py-2 font-medium"
                    >
                      {tDays(String(day))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lessonPeriods.map((period) => (
                  <tr key={period.id} className={cn(period.is_break && "bg-bg/60")}>
                    <th
                      scope="row"
                      className="border-b border-border px-3 py-2 text-left font-normal"
                    >
                      <div className="flex flex-col">
                        <span className="text-fg">{period.name}</span>
                        <span className="text-[12px] text-fg-muted">
                          {period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}
                        </span>
                      </div>
                    </th>
                    {activeDays.map((day) => {
                      const block = blockAt(day, period.sequence);
                      // A cell already covered by a block that started in
                      // an earlier row emits nothing, break or not.
                      // Emitting one anyway pushed every later cell in the
                      // row one column to the right.
                      if (block && block.start_seq !== period.sequence) {
                        return null;
                      }
                      if (period.is_break) {
                        return (
                          <td
                            key={day}
                            className="border-b border-l border-border px-3 py-2 text-fg-muted"
                          />
                        );
                      }
                      if (!block) {
                        return (
                          <td
                            key={day}
                            className="border-b border-l border-border px-2 py-1 align-top"
                          >
                            {canManage && (
                              // Visible without hovering: a tablet has no
                              // hover, and an invisible control is one
                              // nobody finds.
                              <button
                                type="button"
                                onClick={() => {
                                  if (copied) {
                                    void pasteInto(day, period.sequence);
                                    return;
                                  }
                                  setCreating({ day, startSeq: period.sequence });
                                }}
                                className="flex h-full min-h-10 w-full items-center justify-center gap-1 rounded-xs border border-dashed border-border text-[12px] text-fg-muted hover:border-accent hover:bg-accent/5 hover:text-accent"
                              >
                                {copied ? (
                                  <Copy className="size-3.5" aria-hidden="true" />
                                ) : (
                                  <Plus className="size-3.5" aria-hidden="true" />
                                )}
                                {copied ? t("pasteHere") : t("addHere")}
                              </button>
                            )}
                          </td>
                        );
                      }
                      const span = block.end_seq - block.start_seq + 1;
                      const title =
                        mode === "class"
                          ? (teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher"))
                          : (classMap.get(block.class_id)?.name ?? t("unknownClass"));
                      return (
                        <td
                          key={day}
                          rowSpan={span}
                          className="border-b border-l border-border px-2 py-1 align-top"
                        >
                          <div className="group flex h-full min-h-10 flex-col gap-0.5 rounded-xs border border-accent/30 bg-accent/10 px-2 py-1.5">
                            <span className="font-medium text-fg">
                              {subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                            </span>
                            <span className="text-[12px] text-fg-muted">{title}</span>
                            {canManage && (
                              <div className="mt-1 flex items-center gap-1">
                                <BlockAction
                                  label={t("copyBlock")}
                                  icon={<Copy className="size-3.5" aria-hidden="true" />}
                                  onClick={() => {
                                    setCopied(block);
                                  }}
                                />
                                <BlockAction
                                  label={t("editBlock")}
                                  icon={<Pencil className="size-3.5" aria-hidden="true" />}
                                  onClick={() => {
                                    setEditing(block);
                                  }}
                                />
                                <BlockAction
                                  label={t("deleteBlock")}
                                  danger
                                  icon={<Trash2 className="size-3.5" aria-hidden="true" />}
                                  onClick={() => {
                                    setPendingDelete(block);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
