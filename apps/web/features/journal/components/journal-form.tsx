"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useTeachingAssignmentsForTeacherQuery } from "../../academic/api-offerings";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import { useUpsertJournalMutation, type Journal } from "../api";

/** Today as a calendar date (YYYY-MM-DD) in the device's own time zone. */
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

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
  // A journal is almost always written the day the lesson happened.
  const [lessonDate, setLessonDate] = useState(initial?.lesson_date ?? todayISO());
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [activities, setActivities] = useState(initial?.activities ?? "");
  const [reflection, setReflection] = useState(initial?.reflection ?? "");

  const { me } = useSession();
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  // The server accepts a journal only for a class and subject the teacher
  // is assigned to, so the pickers offer those pairs. Without any
  // assignment (an admin, or a substitute) every class stays available.
  const assignments = useTeachingAssignmentsForTeacherQuery(year.id, me?.id ?? "");
  const pairs = useMemo(
    () => (assignments.data?.data ?? []).filter((a) => a.is_active),
    [assignments.data],
  );
  // An existing entry keeps its own class and subject (both are locked).
  const scoped = pairs.length > 0 && initial === undefined;

  const classOptions = useMemo(() => {
    const all = classes.data?.data ?? [];
    const taught = new Set(pairs.map((a) => a.class_id));
    return all
      .filter((c) => !scoped || taught.has(c.id))
      .map((c) => ({ value: c.id, label: c.name }));
  }, [classes.data, pairs, scoped]);

  // With a single choice there is nothing to pick, so it is filled in.
  const effectiveClassId =
    classId || (classOptions.length === 1 ? (classOptions[0]?.value ?? "") : "");
  const subjectOptions = useMemo(() => {
    const all = subjects.data?.data ?? [];
    const taught = new Set(
      pairs.filter((a) => a.class_id === effectiveClassId).map((a) => a.subject_id),
    );
    return all
      .filter((s) => !scoped || taught.has(s.id))
      .map((s) => ({ value: s.id, label: s.name }));
  }, [subjects.data, pairs, scoped, effectiveClassId]);

  const effectiveSubjectId =
    subjectId && (initial !== undefined || subjectOptions.some((o) => o.value === subjectId))
      ? subjectId
      : subjectOptions.length === 1
        ? (subjectOptions[0]?.value ?? "")
        : "";

  const canSubmit =
    effectiveClassId !== "" &&
    effectiveSubjectId !== "" &&
    lessonDate !== "" &&
    topic.trim() !== "" &&
    activities.trim() !== "";

  function submit() {
    upsert.mutate(
      {
        academic_year_id: year.id,
        class_id: effectiveClassId,
        subject_id: effectiveSubjectId,
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
          options={classOptions}
          value={effectiveClassId}
          onValueChange={setClassId}
          placeholder={t("classPlaceholder")}
          disabled={classes.isLoading || initial !== undefined}
          aria-label={t("class")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("subject")}</span>
        <Select
          options={subjectOptions}
          value={effectiveSubjectId}
          onValueChange={setSubjectId}
          placeholder={t("subjectPlaceholder")}
          disabled={subjects.isLoading || effectiveClassId === "" || initial !== undefined}
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

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
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
