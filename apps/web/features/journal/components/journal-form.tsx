"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatTime, type Locale } from "@newsekolah/i18n";
import { Alert, Button, Input, Select, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useTeachingAssignmentsForTeacherQuery } from "../../academic/api-offerings";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import { useUpsertJournalMutation, type Journal } from "../api";
import { clearJournalDraft, loadJournalDraft, saveJournalDraft } from "../lib/journal-draft";

import { JournalFields } from "./journal-fields";

/** Today as a calendar date (YYYY-MM-DD) in the device's own time zone. */
function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Creates or replaces a journal entry: the API upserts by class/subject/date.
 * `prefill*` fills in class/subject/date without locking them the way an
 * existing `initial` entry does -- used when this opens from a specific
 * lesson on the "recent lessons" panel, so the teacher lands with almost
 * nothing left to pick.
 */
export function JournalForm({
  initial,
  prefillClassId,
  prefillSubjectId,
  prefillDate,
  onDone,
}: {
  initial?: Journal;
  prefillClassId?: string;
  prefillSubjectId?: string;
  prefillDate?: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.journal.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const year = useActiveYear();
  const upsert = useUpsertJournalMutation();

  const [classId, setClassId] = useState(initial?.class_id ?? prefillClassId ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? prefillSubjectId ?? "");
  // A journal is almost always written the day the lesson happened.
  const [lessonDate, setLessonDate] = useState(initial?.lesson_date ?? prefillDate ?? todayISO());
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [activities, setActivities] = useState(initial?.activities ?? "");
  const [reflection, setReflection] = useState(initial?.reflection ?? "");
  const [draftOffer, setDraftOffer] = useState<{ savedAt: string } | null>(null);

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
  // An existing entry keeps its own class and subject (both are locked); a
  // prefilled one (from the recent-lessons panel) already knows exactly
  // which lesson it is for, so it is locked too -- only a from-scratch
  // "Jurnal baru" entry needs the picker scoped down to taught pairs.
  const locked = initial !== undefined || prefillClassId !== undefined;
  const scoped = pairs.length > 0 && !locked;

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
    subjectId && (locked || subjectOptions.some((o) => o.value === subjectId))
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

  // Offers a local draft once per resolved class/subject/date -- a
  // from-scratch entry only knows its key once the pickers settle, while a
  // prefilled or existing entry knows it immediately.
  const checkedKey = useRef<string | null>(null);
  useEffect(() => {
    if (effectiveClassId === "" || effectiveSubjectId === "" || lessonDate === "") return;
    const key = `${effectiveClassId}:${effectiveSubjectId}:${lessonDate}`;
    if (checkedKey.current === key) return;
    checkedKey.current = key;
    const draft = loadJournalDraft(effectiveClassId, effectiveSubjectId, lessonDate);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only reachable client-side, so this cannot be a lazy useState initializer.
    if (draft) setDraftOffer({ savedAt: draft.savedAt });
  }, [effectiveClassId, effectiveSubjectId, lessonDate]);

  // Mirrors every edit to localStorage so a dropped connection or an
  // accidental tab close does not throw away a quick entry in progress.
  useEffect(() => {
    if (effectiveClassId === "" || effectiveSubjectId === "" || lessonDate === "") return;
    if (topic.trim() === "" && activities.trim() === "" && reflection.trim() === "") return;
    saveJournalDraft(effectiveClassId, effectiveSubjectId, lessonDate, {
      topic,
      activities,
      reflection,
    });
  }, [effectiveClassId, effectiveSubjectId, lessonDate, topic, activities, reflection]);

  function restoreDraft() {
    const draft = loadJournalDraft(effectiveClassId, effectiveSubjectId, lessonDate);
    if (!draft) return;
    setTopic(draft.topic);
    setActivities(draft.activities);
    setReflection(draft.reflection);
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearJournalDraft(effectiveClassId, effectiveSubjectId, lessonDate);
    setDraftOffer(null);
  }

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
          clearJournalDraft(effectiveClassId, effectiveSubjectId, lessonDate);
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
      {draftOffer && (
        <Alert variant="warning" title={t("draftFoundTitle")}>
          <p>
            {t("draftFoundBody", {
              time: formatTime(draftOffer.savedAt, { locale, timeZone: me?.tenant.timezone }),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={restoreDraft}>
              {t("draftRestore")}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={dismissDraft}>
              {t("draftDismiss")}
            </Button>
          </div>
        </Alert>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("class")}</span>
        <Select
          options={classOptions}
          value={effectiveClassId}
          onValueChange={setClassId}
          placeholder={t("classPlaceholder")}
          disabled={classes.isLoading || locked}
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
          disabled={subjects.isLoading || effectiveClassId === "" || locked}
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
          disabled={locked}
          aria-label={t("date")}
        />
      </label>

      <JournalFields
        topic={topic}
        activities={activities}
        reflection={reflection}
        disabled={false}
        onTopicChange={setTopic}
        onActivitiesChange={setActivities}
        onReflectionChange={setReflection}
      />

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
