"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
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
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  useClassesQuery,
  useLookup,
  usePeriodsQuery,
  useSchoolDaysQuery,
  useSubjectsQuery,
  useTeachersQuery,
} from "../../reference/api";
import { type ScheduleBlock, useDeleteScheduleBlockMutation, useSchedulesQuery } from "../api";

import { ScheduleForm } from "./schedule-form";

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
  const [pendingDelete, setPendingDelete] = useState<ScheduleBlock | null>(null);

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const teachers = useTeachersQuery();
  const periods = usePeriodsQuery();
  const schoolDays = useSchoolDaysQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const teacherMap = useLookup(teachers.data?.data);
  const remove = useDeleteScheduleBlockMutation();

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

  function blockAt(day: number, seq: number): ScheduleBlock | undefined {
    return blocksByDay.get(day)?.find((b) => b.start_seq <= seq && seq <= b.end_seq);
  }

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
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setCreating({ day: activeDays[0] ?? 1, startSeq: lessonPeriods[0]?.sequence ?? 1 });
              }}
            >
              {t("addBlock")}
            </Button>
          )
        }
      />

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

      {loading ? (
        <Skeleton className="h-96 w-full" aria-busy="true" />
      ) : lessonPeriods.length === 0 ? (
        <EmptyState
          icon={<domainIcons.schedule aria-hidden="true" />}
          title={t("noPeriodsTitle")}
          description={t("noPeriodsBody")}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border bg-surface">
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
                    if (period.is_break) {
                      return (
                        <td
                          key={day}
                          className="border-b border-l border-border px-3 py-2 text-fg-muted"
                        />
                      );
                    }
                    const block = blockAt(day, period.sequence);
                    if (block && block.start_seq !== period.sequence) {
                      return null;
                    }
                    if (!block) {
                      return (
                        <td
                          key={day}
                          className="border-b border-l border-border px-2 py-1 align-top"
                        >
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => {
                                setCreating({ day, startSeq: period.sequence });
                              }}
                              className="h-full min-h-10 w-full rounded-xs text-[12px] text-fg-muted opacity-0 hover:bg-bg hover:opacity-100 focus-visible:opacity-100"
                            >
                              {t("addHere")}
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
                            <button
                              type="button"
                              onClick={() => {
                                setPendingDelete(block);
                              }}
                              aria-label={t("deleteBlock")}
                              className="mt-1 inline-flex items-center gap-1 self-start text-[12px] text-fg-muted hover:text-status-absent"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                              {t("deleteBlock")}
                            </button>
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
      )}

      <Dialog
        open={creating !== null}
        onOpenChange={(open) => {
          if (!open) setCreating(null);
        }}
      >
        <DialogContent title={t("addBlock")}>
          {creating && (
            <ScheduleForm
              yearId={year.id}
              initialDay={creating.day}
              initialStartSeq={creating.startSeq}
              initialClassId={effectiveClassId}
              initialTeacherId={effectiveTeacherId}
              onDone={() => {
                setCreating(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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
