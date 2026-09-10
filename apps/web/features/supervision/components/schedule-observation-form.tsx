"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useClassesQuery,
  useLookup,
  useSubjectsQuery,
  useTeachersQuery,
} from "../../reference/api";
import { useSchedulesQuery } from "../../schedule/api";
import { useScheduleObservationMutation } from "../api";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Schedules an observation against one of a teacher's own lesson blocks. */
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

  const teachers = useTeachersQuery();
  const [teacherId, setTeacherId] = useState("");
  const blocks = useSchedulesQuery({ academicYearId: year.id, teacherUserId: teacherId });
  const classes = useClassesQuery();
  const classMap = useLookup(classes.data?.data);
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);

  const [scheduleId, setScheduleId] = useState("");
  const [lessonDate, setLessonDate] = useState(today());
  const schedule = useScheduleObservationMutation(cycleId);

  const teacherOptions = (teachers.data?.data ?? []).map((u) => ({ value: u.id, label: u.name }));
  const blockOptions = (blocks.data?.data ?? []).map((block) => ({
    value: block.schedule_ids[0] ?? "",
    label: [
      tWeekdays(String(block.day_of_week)),
      classMap.get(block.class_id)?.name,
      subjectMap.get(block.subject_id)?.name,
    ]
      .filter(Boolean)
      .join(" – "),
  }));

  const canSubmit = teacherId !== "" && scheduleId !== "" && lessonDate !== "";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("teacher")}</span>
        <Select
          options={teacherOptions}
          value={teacherId}
          onValueChange={(v) => {
            setTeacherId(v);
            setScheduleId("");
          }}
          placeholder={t("teacherPlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("lesson")}</span>
        <Select
          options={blockOptions}
          value={scheduleId}
          onValueChange={setScheduleId}
          placeholder={teacherId ? t("lessonPlaceholder") : t("selectTeacherFirst")}
          disabled={teacherId === ""}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("lessonDate")}</span>
        <Input
          type="date"
          value={lessonDate}
          onChange={(e) => {
            setLessonDate(e.target.value);
          }}
          required
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={schedule.isPending} disabled={!canSubmit}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
