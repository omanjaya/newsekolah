"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Combobox,
  DatePicker,
  DialogFooter,
  Field,
  Select,
  Textarea,
  useDebouncedCallback,
  useSubmitValidation,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { isoWeekdayOf, todayInZone } from "../../../lib/tenant-date";
import { useCalendarEventsQuery } from "../../calendar/api";
import { nonTeachingEventOn } from "../../calendar/lib/event-kinds";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import { useSchedulesQuery } from "../../schedule/api";
import { useCreateSubstitutionMutation, useEligibleSubstitutesQuery } from "../api";

export function RequestForm({
  onDone,
  initialScheduleId = "",
  initialDate = "",
}: {
  onDone: () => void;
  initialScheduleId?: string;
  initialDate?: string;
}): ReactElement {
  const t = useTranslations("app.substitutions.form");
  const tDays = useTranslations("app.common.weekdays");
  const tValidation = useTranslations("validation");
  const { me } = useSession();
  const year = useActiveYear();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const schedules = useSchedulesQuery({ academicYearId: year.id, teacherUserId: me?.id });
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const create = useCreateSubstitutionMutation();
  const calendarEvents = useCalendarEventsQuery();
  const today = todayInZone(me?.tenant.timezone);

  const [scheduleId, setScheduleId] = useState(initialScheduleId);
  const [date, setDate] = useState(initialDate);
  const [substituteId, setSubstituteId] = useState("");
  const [substituteLabel, setSubstituteLabel] = useState("");
  const [substituteSearch, setSubstituteSearch] = useState("");
  const [note, setNote] = useState("");
  // The banner carries only the server's answer; a missing field says so
  // itself, under the field, once Send has been pressed.
  const [error, setError] = useState<string | null>(null);
  const { ref: formRef, attempted, check } = useSubmitValidation();
  const requiredError = (value: string) =>
    attempted && !value ? tValidation("required") : undefined;

  const debounceSubstituteSearch = useDebouncedCallback(setSubstituteSearch, 300);
  const eligibleSubstitutes = useEligibleSubstitutesQuery(year.id, substituteSearch);

  const scheduleOptions = useMemo(
    () =>
      (schedules.data?.data ?? []).map((block) => ({
        value: block.schedule_ids[0] ?? "",
        label:
          `${tDays(String(block.day_of_week))} ${classMap.get(block.class_id)?.name ?? ""} ${subjectMap.get(block.subject_id)?.name ?? ""}`.trim(),
      })),
    [schedules.data, classMap, subjectMap, tDays],
  );
  // Only dates the server would accept can be picked: today or later, on
  // the lesson's own weekday, and not a holiday for the lesson's class.
  const block = schedules.data?.data.find((b) => b.schedule_ids[0] === scheduleId);
  const gradeLevelId = block ? classMap.get(block.class_id)?.grade_level_id : undefined;
  const events = calendarEvents.data?.data;
  const isDateDisabled = useCallback(
    (iso: string) =>
      (block !== undefined && isoWeekdayOf(iso) !== block.day_of_week) ||
      nonTeachingEventOn(events ?? [], iso, gradeLevelId) !== undefined,
    [block, events, gradeLevelId],
  );
  const dateHint = block
    ? t("dateHint", { day: tDays(String(block.day_of_week)) })
    : t("dateHintNoLesson");

  // Keeps the picked name showing in the trigger even after the search
  // text moves on and the candidate falls out of the latest results.
  const substituteOptions = useMemo(() => {
    const base = (eligibleSubstitutes.data?.data ?? []).map((candidate) => ({
      value: candidate.user_id,
      label: candidate.name,
    }));
    if (substituteId && !base.some((option) => option.value === substituteId)) {
      return [{ value: substituteId, label: substituteLabel }, ...base];
    }
    return base;
  }, [eligibleSubstitutes.data, substituteId, substituteLabel]);

  async function submit() {
    setError(null);
    if (!check(Boolean(scheduleId && date && substituteId))) return;
    try {
      await create.mutateAsync({
        schedule_id: scheduleId,
        date,
        substitute_user_id: substituteId,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(t("sent"));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && <Alert variant="danger">{error}</Alert>}
      <Field label={t("schedule")} required error={requiredError(scheduleId)}>
        <Select
          options={scheduleOptions}
          value={scheduleId}
          onValueChange={(value) => {
            setScheduleId(value);
            // A date picked for another lesson's weekday no longer fits.
            if (value !== scheduleId) setDate("");
          }}
          placeholder={t("pick")}
        />
      </Field>
      <Field label={t("date")} required hint={dateHint} error={requiredError(date)}>
        <DatePicker
          value={date}
          onChange={setDate}
          clearable={false}
          today={today}
          min={today}
          isDateDisabled={isDateDisabled}
        />
      </Field>
      <Field label={t("substitute")} required error={requiredError(substituteId)}>
        <Combobox
          options={substituteOptions}
          value={substituteId}
          onValueChange={(value) => {
            setSubstituteId(value);
            setSubstituteLabel(
              substituteOptions.find((option) => option.value === value)?.label ?? "",
            );
          }}
          search={substituteSearch}
          onSearchChange={debounceSubstituteSearch}
          placeholder={t("pick")}
          searchPlaceholder={t("substituteSearchPlaceholder")}
          emptyLabel={t("substituteEmpty")}
          loading={eligibleSubstitutes.isLoading}
          aria-label={t("substitute")}
        />
      </Field>
      <Field label={t("note")} optional>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone} disabled={create.isPending}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("send")}
        </Button>
      </DialogFooter>
    </form>
  );
}
