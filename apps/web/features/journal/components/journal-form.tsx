"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatTime, type Locale } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  DatePicker,
  DialogFooter,
  Field,
  Select,
  useSubmitValidation,
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useDraftOwner } from "../../../lib/drafts/draft-owner";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useSimulation } from "../../../lib/simulation/clock";
import { todayInZone } from "../../../lib/tenant-date";
import { useTeachingAssignmentsForTeacherQuery } from "../../academic/api-offerings";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import { useJournalsQuery, useUpsertJournalMutation, type Journal } from "../api";
import { clearJournalDraft, loadJournalDraft, saveJournalDraft } from "../lib/journal-draft";

import { JournalFields } from "./journal-fields";

/**
 * Writes a new journal entry, or edits `initial`. A lesson (class, subject,
 * date) has one journal: a new entry for a lesson that already has one is
 * not sent (the API would refuse it rather than replace the first); the
 * form says so and offers to open that journal instead. `prefill*` fills in
 * class/subject/date without locking them the way an existing `initial`
 * entry does -- used when this opens from a specific lesson on the "recent
 * lessons" panel, so the teacher lands with almost nothing left to pick.
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
  const draftOwner = useDraftOwner();
  const { revision } = useSimulation();
  const year = useActiveYear();
  const upsert = useUpsertJournalMutation();
  // The journal being edited: `initial`, or the existing one the teacher
  // chose to open when a new entry turned out to clash with it.
  const [editing, setEditing] = useState<Journal | undefined>(initial);
  // A double click fires the second submit before `isPending` re-renders
  // the button busy; this guard is synchronous, so only one request goes.
  const inFlight = useRef(false);

  const [classId, setClassId] = useState(initial?.class_id ?? prefillClassId ?? "");
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? prefillSubjectId ?? "");
  // A journal is almost always written the day the lesson happened.
  const [selectedDate, setSelectedDate] = useState<{ revision: number; date: string } | null>(null);
  const lessonDate =
    selectedDate?.revision === revision
      ? selectedDate.date
      : (initial?.lesson_date ?? prefillDate ?? todayInZone(me?.tenant.timezone));
  const setLessonDate = (date: string) => {
    setSelectedDate({ revision, date });
  };
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
  const locked = editing !== undefined || prefillClassId !== undefined;
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

  // A new entry checks whether its lesson already has a journal, so the
  // teacher finds out before typing it all, not after a refused save.
  const sameDay = useJournalsQuery(undefined, 0, 50, undefined, lessonDate, lessonDate);
  const existing =
    editing === undefined
      ? sameDay.data?.data.find(
          (j) =>
            j.class_id === effectiveClassId &&
            j.subject_id === effectiveSubjectId &&
            j.lesson_date === lessonDate,
        )
      : undefined;

  function openExisting(journal: Journal) {
    setEditing(journal);
    setTopic(journal.topic);
    setActivities(journal.activities);
    setReflection(journal.reflection ?? "");
  }

  const canSubmit =
    effectiveClassId !== "" &&
    effectiveSubjectId !== "" &&
    lessonDate !== "" &&
    topic.trim() !== "" &&
    activities.trim() !== "";
  const { ref: formRef, attempted, check } = useSubmitValidation();
  const tValidation = useTranslations("validation");
  const requiredError = (value: string) =>
    attempted && !value.trim() ? tValidation("required") : undefined;

  // Offers a local draft once per owner and resolved class/subject/date --
  // a from-scratch entry only knows its key once the pickers settle, while
  // a prefilled or existing entry knows it immediately, and the owner may
  // only become known after the first render. Once the lesson is resolved,
  // finding no draft of this owner's (or no owner) withdraws any earlier
  // offer, since a draft is only ever offered to the account that wrote it.
  // An effect because localStorage is only reachable client-side, so this
  // cannot be a lazy useState initializer.
  const checkedKey = useRef<string | null>(null);
  useEffect(() => {
    if (effectiveClassId === "" || effectiveSubjectId === "" || lessonDate === "") return;
    const key = `${draftOwner ?? ""}|${effectiveClassId}:${effectiveSubjectId}:${lessonDate}`;
    if (checkedKey.current === key) return;
    checkedKey.current = key;
    const draft = loadJournalDraft(draftOwner, effectiveClassId, effectiveSubjectId, lessonDate);
    setDraftOffer(draft ? { savedAt: draft.savedAt } : null);
  }, [draftOwner, effectiveClassId, effectiveSubjectId, lessonDate]);

  // Mirrors every edit to localStorage so a dropped connection or an
  // accidental tab close does not throw away a quick entry in progress.
  useEffect(() => {
    if (effectiveClassId === "" || effectiveSubjectId === "" || lessonDate === "") return;
    if (topic.trim() === "" && activities.trim() === "" && reflection.trim() === "") return;
    saveJournalDraft(draftOwner, effectiveClassId, effectiveSubjectId, lessonDate, {
      topic,
      activities,
      reflection,
    });
  }, [draftOwner, effectiveClassId, effectiveSubjectId, lessonDate, topic, activities, reflection]);

  function restoreDraft() {
    const draft = loadJournalDraft(draftOwner, effectiveClassId, effectiveSubjectId, lessonDate);
    if (!draft) return;
    setTopic(draft.topic);
    setActivities(draft.activities);
    setReflection(draft.reflection);
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearJournalDraft(draftOwner, effectiveClassId, effectiveSubjectId, lessonDate);
    setDraftOffer(null);
  }

  function submit() {
    if (existing) {
      toast.error(apiErrorMessage("JOURNAL_CONFLICT"));
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    upsert.mutate(
      {
        ...(editing ? { id: editing.id } : {}),
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
          clearJournalDraft(draftOwner, effectiveClassId, effectiveSubjectId, lessonDate);
          toast.success(t("saved"));
          onDone();
        },
        onError: (error) => {
          // Someone saved this lesson's journal meanwhile: the same-day
          // check above picks it up and offers to open it.
          if (error instanceof ApiError && error.code === "JOURNAL_CONFLICT") {
            void sameDay.refetch();
          }
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!check(canSubmit)) return;
        submit();
      }}
    >
      {existing && (
        <Alert
          variant="warning"
          title={t("existsTitle")}
          action={
            <Button
              type="button"
              size="sm"
              onClick={() => {
                openExisting(existing);
              }}
            >
              {t("openExisting")}
            </Button>
          }
        >
          {t("existsBody")}
        </Alert>
      )}
      {draftOffer && (
        <Alert
          variant="warning"
          title={t("draftFoundTitle")}
          action={
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={dismissDraft}>
                {t("draftDismiss")}
              </Button>
              <Button type="button" size="sm" onClick={restoreDraft}>
                {t("draftRestore")}
              </Button>
            </div>
          }
        >
          {t("draftFoundBody", {
            time: formatTime(draftOffer.savedAt, { locale, timeZone: me?.tenant.timezone }),
          })}
        </Alert>
      )}
      <Field label={t("class")} required error={requiredError(effectiveClassId)}>
        <Select
          options={classOptions}
          value={effectiveClassId}
          onValueChange={setClassId}
          placeholder={t("classPlaceholder")}
          disabled={classes.isLoading || locked}
          aria-label={t("class")}
        />
      </Field>
      <Field label={t("subject")} required error={requiredError(effectiveSubjectId)}>
        <Select
          options={subjectOptions}
          value={effectiveSubjectId}
          onValueChange={setSubjectId}
          placeholder={t("subjectPlaceholder")}
          disabled={subjects.isLoading || effectiveClassId === "" || locked}
          aria-label={t("subject")}
        />
      </Field>
      <Field label={t("date")} required error={requiredError(lessonDate)}>
        <DatePicker
          value={lessonDate}
          onChange={setLessonDate}
          clearable={false}
          disabled={locked}
        />
      </Field>

      <JournalFields
        topic={topic}
        activities={activities}
        reflection={reflection}
        disabled={false}
        onTopicChange={setTopic}
        onActivitiesChange={setActivities}
        onReflectionChange={setReflection}
        requiredError={requiredError}
      />

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={upsert.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
