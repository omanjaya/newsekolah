"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import { useUpsertJournalMutation, type Journal } from "../api";

/** Creates or replaces a journal entry: the API upserts by class/subject/date. */
export function JournalForm({
  initial,
  onDone,
}: {
  initial?: Journal;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.journal.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const year = useActiveYear();
  const upsert = useUpsertJournalMutation();

  const [classId, setClassId] = useState(initial?.class_id ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? "");
  const [lessonDate, setLessonDate] = useState(initial?.lesson_date ?? "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [activities, setActivities] = useState(initial?.activities ?? "");
  const [reflection, setReflection] = useState(initial?.reflection ?? "");

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();

  const canSubmit =
    classId !== "" &&
    subjectId !== "" &&
    lessonDate !== "" &&
    topic.trim() !== "" &&
    activities.trim() !== "";

  function submit() {
    upsert.mutate(
      {
        academic_year_id: year.id,
        class_id: classId,
        subject_id: subjectId,
        lesson_date: lessonDate,
        topic: topic.trim(),
        activities: activities.trim(),
        ...(reflection.trim() ? { reflection: reflection.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(t("saved"));
          onDone();
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("class")}</span>
        <Select
          options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          value={classId}
          onValueChange={setClassId}
          placeholder={t("classPlaceholder")}
          disabled={classes.isLoading || initial !== undefined}
          aria-label={t("class")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("subject")}</span>
        <Select
          options={(subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={subjectId}
          onValueChange={setSubjectId}
          placeholder={t("subjectPlaceholder")}
          disabled={subjects.isLoading || initial !== undefined}
          aria-label={t("subject")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("date")}</span>
        <Input
          type="date"
          value={lessonDate}
          onChange={(e) => {
            setLessonDate(e.target.value);
          }}
          disabled={initial !== undefined}
          aria-label={t("date")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("topic")}</span>
        <Input
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
          }}
          placeholder={t("topicPlaceholder")}
          aria-label={t("topic")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("activities")}</span>
        <Textarea
          value={activities}
          onChange={(e) => {
            setActivities(e.target.value);
          }}
          placeholder={t("activitiesPlaceholder")}
          aria-label={t("activities")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("reflection")}</span>
        <Textarea
          value={reflection}
          onChange={(e) => {
            setReflection(e.target.value);
          }}
          placeholder={t("reflectionPlaceholder")}
          aria-label={t("reflection")}
        />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={upsert.isPending} disabled={!canSubmit}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
