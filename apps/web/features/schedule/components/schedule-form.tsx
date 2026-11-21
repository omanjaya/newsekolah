"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  DatePicker,
  DialogFooter,
  Field,
  Select,
  Skeleton,
  Textarea,
  useSubmitValidation,
  useToast,
} from "@newsekolah/ui";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery, useLookup, usePeriodsQuery, useSubjectsQuery } from "../../reference/api";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import {
  type ScheduleBlock,
  type ScheduleHold,
  useCreateScheduleMutation,
  useReplaceScheduleBlockMutation,
  useScheduleQuery,
} from "../api";
import { clockLabel } from "../clock-label";
import { earliestEffectiveFromOf, holdOf } from "../effective-error";
import { useNamedConflict } from "../use-named-conflict";

import { EffectiveFromHint } from "./effective-from-hint";

/**
 * Whether and how the form asks for the date the lesson or the change
 * takes effect ("Berlaku mulai"); the timetable is effective-dated.
 *
 * - `create`: a new lesson, from a date (default: the slot's date, never
 *   before today).
 * - `dated`: a block with recorded attendance or a substitution. The
 *   change takes effect from a date no earlier than `min`; every lesson
 *   before it stays as it was taught. `heldBy` names the record that holds
 *   `min` there, when one does.
 * - `none`: a block without history, corrected in place for the whole
 *   academic year.
 */
export interface EffectiveDateConfig {
  mode: "create" | "dated" | "none";
  defaultValue: string;
  min?: string;
  max?: string;
  /** The school's today, which the picker marks. */
  today?: string;
  heldBy?: ScheduleHold;
}

export function ScheduleForm({
  yearId,
  initialDay,
  initialStartSeq,
  initialClassId,
  initialTeacherId,
  editing,
  effective,
  onDone,
}: {
  yearId: string;
  initialDay: number;
  initialStartSeq: number;
  initialClassId: string;
  initialTeacherId: string;
  /** The block being changed; omitted means this form creates a new one. */
  editing?: ScheduleBlock;
  /** Omitted (a reader who may not date a change): no date is asked or sent. */
  effective?: EffectiveDateConfig;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.schedule.form");
  // Conflict messages ("period X in class Y is already taken by...") are
  // shared copy from the parent schedule namespace, the same strings the
  // grid's copy/paste uses -- one clash sentence for the whole feature
  // instead of the form silently falling back to a generic error code.
  const tSchedule = useTranslations("app.schedule");
  const tDays = useTranslations("app.common.weekdays");
  const tCommon = useTranslations("app.offlinePage");
  const tValidation = useTranslations("validation");
  const locale = useLocale();
  const format = useFormatter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const teacherLabels = useDirectoryPickerLabels(tSchedule("pickTeacher"));
  const periods = usePeriodsQuery();
  const create = useCreateScheduleMutation();
  const replace = useReplaceScheduleBlockMutation();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const namedConflict = useNamedConflict();
  // ScheduleBlock (the merged-block row the grid renders) never carries
  // `notes`, so editing a block from that shape alone would silently drop
  // any existing note on save; fetch the full Schedule once to prefill it.
  const detail = useScheduleQuery(editing?.schedule_ids[0] ?? "", Boolean(editing));

  const lessons = (periods.data?.data ?? []).filter((p) => !p.is_break);
  const startDefault =
    lessons.find((p) => p.sequence === (editing?.start_seq ?? initialStartSeq)) ?? lessons[0];
  const endDefault = editing
    ? (lessons.find((p) => p.sequence === editing.end_seq) ?? startDefault)
    : startDefault;

  const [classId, setClassId] = useState(editing?.class_id ?? initialClassId);
  const [subjectId, setSubjectId] = useState(editing?.subject_id ?? "");
  const [teacherId, setTeacherId] = useState(editing?.teacher_user_id ?? initialTeacherId);
  const [day, setDay] = useState(String(editing?.day_of_week ?? initialDay));
  const [startId, setStartId] = useState(startDefault?.id ?? "");
  const [endId, setEndId] = useState(endDefault?.id ?? "");
  const [notes, setNotes] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(effective?.defaultValue ?? "");
  // A block that gained history after the grid loaded comes back from the
  // server with the earliest date it accepts: the form then asks for a
  // date from it instead of failing the same way again.
  const [serverMin, setServerMin] = useState<string | undefined>(undefined);
  const [serverHold, setServerHold] = useState<ScheduleHold | undefined>(undefined);
  const dateMode = serverMin !== undefined ? "dated" : (effective?.mode ?? "none");
  const minDate = serverMin ?? effective?.min;
  const hold = serverMin !== undefined ? serverHold : effective?.heldBy;
  const asksDate = effective !== undefined && dateMode !== "none";
  const showDate = (iso: string) =>
    formatCalendarDate(format, iso, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  // The banner is for what no single field owns: a reversed period range,
  // a timetable clash, a server error. A missing field says so itself.
  const [error, setError] = useState<string | null>(null);
  const { ref: formRef, attempted, check } = useSubmitValidation();
  const requiredError = (value: string) =>
    attempted && !value ? tValidation("required") : undefined;

  // `detail` (the full Schedule, with `notes`) resolves after this form's
  // first render for an edit, since it's an async fetch keyed off
  // `editing.schedule_ids[0]`. Seeding `notes` from it belongs in the
  // render body, not an effect: it runs once, the moment the data first
  // arrives, and React folds the resulting re-render into the same commit
  // (see "You Might Not Need an Effect" in the React docs).
  const [notesSeeded, setNotesSeeded] = useState(false);
  if (detail.data && !notesSeeded) {
    setNotesSeeded(true);
    setNotes(detail.data.notes ?? "");
  }

  const periodOptions = lessons.map((p) => ({
    value: p.id,
    label: `${p.name} (${clockLabel(p.starts_at, locale)})`,
  }));

  async function submit() {
    setError(null);
    if (
      !check(
        Boolean(
          classId &&
          subjectId &&
          teacherId &&
          day &&
          startId &&
          endId &&
          (!asksDate || effectiveFrom),
        ),
      )
    ) {
      return;
    }
    const start = lessons.find((p) => p.id === startId);
    const end = lessons.find((p) => p.id === endId);
    if (start && end && end.sequence < start.sequence) {
      setError(t("rangeError"));
      return;
    }
    const body = {
      academic_year_id: yearId,
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherId,
      day_of_week: Number(day),
      start_period_id: startId,
      end_period_id: endId,
      source: "admin" as const,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(asksDate ? { effective_from: effectiveFrom } : {}),
    };
    try {
      if (editing) {
        const saved = await replace.mutateAsync({ scheduleIds: editing.schedule_ids, body });
        // A dated change makes a new version; a change to the notes alone
        // is saved on the same one, whatever date was given.
        const newVersion = asksDate && saved.id !== editing.schedule_ids[0];
        toast.success(
          newVersion ? t("updatedFrom", { date: showDate(saved.effective_from) }) : t("updated"),
        );
      } else {
        const saved = await create.mutateAsync(body);
        toast.success(
          asksDate ? t("createdFrom", { date: showDate(saved.effective_from) }) : t("created"),
        );
      }
      onDone();
    } catch (err) {
      const earliest = earliestEffectiveFromOf(err);
      if (earliest && effective !== undefined && err instanceof ApiError) {
        setServerMin(earliest);
        setServerHold(holdOf(err));
        setEffectiveFrom(earliest);
        setError(
          `${apiErrorMessage(err.code)} ${t("effectiveFromHintDated", { date: showDate(earliest) })}`,
        );
        return;
      }
      const named = await namedConflict(
        err,
        { classMap, subjectMap, teacherMap: new Map(), periods: periods.data?.data ?? [] },
        tSchedule,
      );
      setError(
        named ?? (err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN")),
      );
    }
  }

  // Every field but the notes is required, and each one shows its own
  // error once Save has been pressed (docs/07-ui-ux.md, Form).
  const field = (label: string, value: string, control: ReactElement) => (
    <Field label={label} required error={requiredError(value)}>
      {control}
    </Field>
  );

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && <Alert variant="danger">{error}</Alert>}
      {effective !== undefined && dateMode === "dated" && (
        <Alert variant="info" title={t("historyNoticeTitle")}>
          {t("historyNoticeBody")}
        </Alert>
      )}
      {field(
        t("class"),
        classId,
        <Select
          options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          value={classId}
          onValueChange={setClassId}
          placeholder={tSchedule("pickClass")}
        />,
      )}
      {field(
        t("subject"),
        subjectId,
        <Select
          options={(subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={subjectId}
          onValueChange={setSubjectId}
          placeholder={tSchedule("pickSubject")}
        />,
      )}
      {field(
        t("teacher"),
        teacherId,
        <DirectoryPicker
          profileKind="teacher"
          value={teacherId}
          onValueChange={setTeacherId}
          labels={teacherLabels}
        />,
      )}
      {/* The day on its own row, the two periods side by side, so a period
          label ("Jam 1 (07.00)") never wraps inside its select. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          {field(
            t("day"),
            day,
            <Select
              options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
                value: String(d),
                label: tDays(String(d)),
              }))}
              value={day}
              onValueChange={setDay}
            />,
          )}
        </div>
        {field(
          t("start"),
          startId,
          <Select options={periodOptions} value={startId} onValueChange={setStartId} />,
        )}
        {field(
          t("end"),
          endId,
          <Select options={periodOptions} value={endId} onValueChange={setEndId} />,
        )}
      </div>
      {asksDate && (
        <Field
          label={t("effectiveFrom")}
          required
          error={requiredError(effectiveFrom)}
          hint={
            dateMode === "dated" && minDate ? (
              <EffectiveFromHint min={minDate} hold={hold} />
            ) : (
              t("effectiveFromHintCreate")
            )
          }
        >
          <DatePicker
            value={effectiveFrom}
            onChange={setEffectiveFrom}
            min={minDate}
            max={effective.max}
            today={effective.today}
            clearable={false}
            required
          />
        </Field>
      )}
      {editing && effective?.mode === "none" && dateMode === "none" && (
        <p className="text-body-sm text-fg-muted">{t("inPlaceNote")}</p>
      )}
      {editing && detail.isLoading ? (
        <Skeleton className="h-20 w-full" aria-busy="true" />
      ) : editing && detail.isError ? (
        <Alert
          variant="danger"
          title={t("notesLoadError")}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void detail.refetch()}
            >
              {tCommon("retry")}
            </Button>
          }
        />
      ) : (
        <Field label={t("notes")} optional>
          <Textarea
            value={notes}
            maxLength={500}
            placeholder={t("notesPlaceholder")}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        </Field>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={onDone}
          disabled={create.isPending || replace.isPending}
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          loading={create.isPending || replace.isPending}
          disabled={Boolean(editing) && (detail.isLoading || detail.isError)}
        >
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
