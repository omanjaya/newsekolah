"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useClassesQuery,
  usePeriodsQuery,
  useSubjectsQuery,
  useTeachersQuery,
} from "../../reference/api";
import { useCreateScheduleMutation } from "../api";

export function ScheduleForm({
  yearId,
  initialDay,
  initialStartSeq,
  initialClassId,
  initialTeacherId,
  onDone,
}: {
  yearId: string;
  initialDay: number;
  initialStartSeq: number;
  initialClassId: string;
  initialTeacherId: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.schedule.form");
  const tDays = useTranslations("app.common.weekdays");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const teachers = useTeachersQuery();
  const periods = usePeriodsQuery();
  const create = useCreateScheduleMutation();

  const lessons = (periods.data?.data ?? []).filter((p) => !p.is_break);
  const startDefault = lessons.find((p) => p.sequence === initialStartSeq) ?? lessons[0];

  const [classId, setClassId] = useState(initialClassId);
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState(initialTeacherId);
  const [day, setDay] = useState(String(initialDay));
  const [startId, setStartId] = useState(startDefault?.id ?? "");
  const [endId, setEndId] = useState(startDefault?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const periodOptions = lessons.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.starts_at.slice(0, 5)})`,
  }));

  async function submit() {
    setError(null);
    if (!classId || !subjectId || !teacherId || !startId || !endId) {
      setError(t("requiredError"));
      return;
    }
    const start = lessons.find((p) => p.id === startId);
    const end = lessons.find((p) => p.id === endId);
    if (start && end && end.sequence < start.sequence) {
      setError(t("rangeError"));
      return;
    }
    try {
      await create.mutateAsync({
        academic_year_id: yearId,
        class_id: classId,
        subject_id: subjectId,
        teacher_user_id: teacherId,
        day_of_week: Number(day),
        start_period_id: startId,
        end_period_id: endId,
        source: "admin",
      });
      toast.success(t("created"));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  const field = (label: string, control: ReactElement) => (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-medium">{label}</span>
      {control}
    </label>
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      {field(
        t("class"),
        <Select
          options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          value={classId}
          onValueChange={setClassId}
          placeholder={t("pick")}
        />,
      )}
      {field(
        t("subject"),
        <Select
          options={(subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={subjectId}
          onValueChange={setSubjectId}
          placeholder={t("pick")}
        />,
      )}
      {field(
        t("teacher"),
        <Select
          options={(teachers.data?.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
          value={teacherId}
          onValueChange={setTeacherId}
          placeholder={t("pick")}
        />,
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {field(
          t("day"),
          <Select
            options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
              value: String(d),
              label: tDays(String(d)),
            }))}
            value={day}
            onValueChange={setDay}
          />,
        )}
        {field(
          t("start"),
          <Select options={periodOptions} value={startId} onValueChange={setStartId} />,
        )}
        {field(t("end"), <Select options={periodOptions} value={endId} onValueChange={setEndId} />)}
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone} disabled={create.isPending}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
