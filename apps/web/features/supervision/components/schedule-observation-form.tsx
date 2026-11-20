"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, DatePicker, DialogFooter, Field, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { useSchedulesQuery } from "../../schedule/api";
import { useScheduleObservationMutation } from "../api";
import { isoWeekdayOf } from "../lib/lesson-weekday";

/**
 * Schedules an observation against one of a teacher's own lesson blocks:
 * the teacher, the date of the visit, and which of their lessons that day
 * (only the blocks on the date's weekday, in effect on that date, are
 * offered: a Monday lesson is never observed on a Friday, nor after it was
 * changed or removed from the timetable, and the API refuses both).
 */
export function ScheduleObservationForm({
  cycleId,
  onDone,
}: {
  cycleId: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.supervision.schedule.form");
  const tWeekdays = useTranslations("app.common.weekdays");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const year = useActiveYear();

  const teacherLabels = useDirectoryPickerLabels(t("teacherPlaceholder"));
  const [teacherId, setTeacherId] = useState("");
  const classes = useClassesQuery();
  const classMap = useLookup(classes.data?.data);
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);

  const [scheduleId, setScheduleId] = useState("");
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);
  const [lessonDate, setLessonDate] = useState(today);
  // The week of the visit's date, so each weekday lists the lessons in
  // effect then (the timetable is effective-dated).
  const blocks = useSchedulesQuery({
    academicYearId: year.id,
    teacherUserId: teacherId,
    asOf: lessonDate || today,
  });
  const [attempted, setAttempted] = useState(false);
  const schedule = useScheduleObservationMutation(cycleId);

  const weekday = isoWeekdayOf(lessonDate);
  const dayBlocks = (blocks.data?.data ?? []).filter((block) => block.day_of_week === weekday);
  const blockOptions = dayBlocks.map((block) => ({
    value: block.schedule_ids[0] ?? "",
    label: [
      tWeekdays(String(block.day_of_week)),
      classMap.get(block.class_id)?.name,
      subjectMap.get(block.subject_id)?.name,
    ]
      .filter(Boolean)
      .join(" – "),
  }));

  const errors = {
    teacher: teacherId === "" ? t("errors.teacher") : undefined,
    lesson: scheduleId === "" ? t("errors.lesson") : undefined,
    date: lessonDate === "" ? t("errors.date") : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  // The teacher's blocks are in, and none falls on the chosen date's weekday.
  const noLessonThatDay = teacherId !== "" && blocks.data !== undefined && dayBlocks.length === 0;
  const shown = (error: string | undefined) => (attempted ? error : undefined);

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!valid || schedule.isPending) return;
        schedule.mutate(
          { schedule_id: scheduleId, lesson_date: lessonDate },
          {
            onSuccess: () => {
              toast.success(t("saved"));
              onDone();
            },
            onError: (error) => {
              toast.error(
                error instanceof ApiError
                  ? apiErrorMessage(error.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      <Field label={t("teacher")} required error={shown(errors.teacher)}>
        <DirectoryPicker
          profileKind="teacher"
          value={teacherId}
          onValueChange={(id) => {
            setTeacherId(id);
            setScheduleId("");
          }}
          labels={teacherLabels}
        />
      </Field>
      <Field label={t("lessonDate")} required error={shown(errors.date)}>
        <DatePicker
          value={lessonDate}
          onChange={(next) => {
            setLessonDate(next);
            // A lesson of another weekday no longer fits the visit.
            if (isoWeekdayOf(next) !== weekday) setScheduleId("");
          }}
          today={today}
          required
        />
      </Field>
      <Field
        label={t("lesson")}
        required
        disabled={teacherId === "" || noLessonThatDay}
        hint={
          teacherId === ""
            ? t("selectTeacherFirst")
            : noLessonThatDay && weekday !== undefined
              ? t("noLessonOnDay", { day: tWeekdays(String(weekday)) })
              : undefined
        }
        error={teacherId === "" || noLessonThatDay ? undefined : shown(errors.lesson)}
      >
        <Select
          options={blockOptions}
          value={scheduleId}
          onValueChange={setScheduleId}
          placeholder={t("lessonPlaceholder")}
          disabled={teacherId === "" || noLessonThatDay}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={schedule.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
