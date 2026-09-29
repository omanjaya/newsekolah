"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Combobox,
  Input,
  Select,
  Textarea,
  useDebouncedCallback,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
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

  const [scheduleId, setScheduleId] = useState(initialScheduleId);
  const [date, setDate] = useState(initialDate);
  const [substituteId, setSubstituteId] = useState("");
  const [substituteLabel, setSubstituteLabel] = useState("");
  const [substituteSearch, setSubstituteSearch] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    if (!scheduleId || !date || !substituteId) {
      setError(t("requiredError"));
      return;
    }
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
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("schedule")}</span>
        <Select
          options={scheduleOptions}
          value={scheduleId}
          onValueChange={setScheduleId}
          placeholder={t("pick")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("date")}</span>
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("substitute")}</span>
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
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("note")}</span>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone} disabled={create.isPending}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("send")}
        </Button>
      </div>
    </form>
  );
}
