"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import {
  useCreateReportScheduleMutation,
  useReportTermsQuery,
  useReportsQuery,
  useUpdateReportScheduleMutation,
  type ReportSchedule,
  type ReportScheduleCadence,
} from "../api";

import { ScheduleRecipientsInput } from "./schedule-recipients-input";

const WEEKDAY_VALUES = [0, 1, 2, 3, 4, 5, 6];
const HOUR_VALUES = Array.from({ length: 24 }, (_, i) => i);

export function ScheduleForm({
  initial,
  onDone,
}: {
  initial?: ReportSchedule;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.reports.schedules.form");
  const tKinds = useTranslations("app.reports.kinds");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateReportScheduleMutation();
  const update = useUpdateReportScheduleMutation();
  const reports = useReportsQuery();

  const [reportKind, setReportKind] = useState(initial?.report_kind ?? "");
  const [classId, setClassId] = useState(initial?.params?.class_id ?? "");
  const [subjectId, setSubjectId] = useState(initial?.params?.subject_id ?? "");
  const [termId, setTermId] = useState(initial?.params?.term_id ?? "");
  const [cadence, setCadence] = useState<ReportScheduleCadence>(initial?.cadence ?? "daily");
  const [weekday, setWeekday] = useState(String(initial?.weekday ?? 1));
  const [dayOfMonth, setDayOfMonth] = useState(String(initial?.day_of_month ?? 1));
  const [hour, setHour] = useState(String(initial?.hour ?? 7));
  const [recipients, setRecipients] = useState<string[]>(initial?.recipients ?? []);

  const selectedReport = reports.data?.data.find((r) => r.kind === reportKind);
  const needsClass = selectedReport?.arguments.some((a) => a.kind === "class") ?? false;
  const needsSubject = selectedReport?.arguments.some((a) => a.kind === "subject") ?? false;
  const needsTerm = selectedReport?.arguments.some((a) => a.kind === "term") ?? false;

  const classes = useClassesQuery(needsClass);
  const subjects = useSubjectsQuery(needsSubject);
  const terms = useReportTermsQuery(needsTerm);

  const pending = create.isPending || update.isPending;
  const canSubmit =
    reportKind !== "" &&
    recipients.length > 0 &&
    (cadence !== "weekly" || weekday !== "") &&
    (cadence !== "monthly" || dayOfMonth !== "");

  function submitSchedule() {
    const body = {
      report_kind: reportKind,
      params: {
        ...(needsClass && classId ? { class_id: classId } : {}),
        ...(needsSubject && subjectId ? { subject_id: subjectId } : {}),
        ...(needsTerm && termId ? { term_id: termId } : {}),
      },
      cadence,
      ...(cadence === "weekly" ? { weekday: Number(weekday) } : {}),
      ...(cadence === "monthly" ? { day_of_month: Number(dayOfMonth) } : {}),
      hour: Number(hour),
      recipients,
    };
    const onSuccess = () => {
      toast.success(t("saved"));
      onDone();
    };
    const onError = (error: unknown) => {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    };
    if (initial) {
      update.mutate({ id: initial.id, ...body }, { onSuccess, onError });
    } else {
      create.mutate(body, { onSuccess, onError });
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submitSchedule();
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("reportKind")}</span>
        <Select
          options={(reports.data?.data ?? []).map((r) => {
            const kindKey = r.kind.replaceAll(".", "_");
            return {
              value: r.kind,
              label: tKinds.has(`${kindKey}.label`) ? tKinds(`${kindKey}.label`) : r.kind,
            };
          })}
          value={reportKind}
          onValueChange={setReportKind}
          placeholder={t("reportKindPlaceholder")}
          disabled={initial !== undefined || reports.isLoading}
          aria-label={t("reportKind")}
        />
      </label>

      {needsClass && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("class")}</span>
          <Select
            options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={classId}
            onValueChange={setClassId}
            placeholder={t("classPlaceholder")}
            disabled={classes.isLoading}
            aria-label={t("class")}
          />
        </label>
      )}
      {needsSubject && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("subject")}</span>
          <Select
            options={(subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            value={subjectId}
            onValueChange={setSubjectId}
            placeholder={t("subjectPlaceholder")}
            disabled={subjects.isLoading}
            aria-label={t("subject")}
          />
        </label>
      )}
      {needsTerm && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("term")}</span>
          <Select
            options={(terms.data?.data ?? []).map((tm) => ({ value: tm.id, label: tm.name }))}
            value={termId}
            onValueChange={setTermId}
            placeholder={t("termPlaceholder")}
            disabled={terms.isLoading}
            aria-label={t("term")}
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("cadence")}</span>
        <Select
          options={[
            { value: "daily", label: t("cadenceDaily") },
            { value: "weekly", label: t("cadenceWeekly") },
            { value: "monthly", label: t("cadenceMonthly") },
          ]}
          value={cadence}
          onValueChange={(v) => {
            setCadence(v as ReportScheduleCadence);
          }}
          aria-label={t("cadence")}
        />
      </label>

      {cadence === "weekly" && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("weekday")}</span>
          <Select
            options={WEEKDAY_VALUES.map((d) => ({
              value: String(d),
              label: t(`weekdayName.${d}`),
            }))}
            value={weekday}
            onValueChange={setWeekday}
            aria-label={t("weekday")}
          />
        </label>
      )}
      {cadence === "monthly" && (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("dayOfMonth")}</span>
          <Input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => {
              setDayOfMonth(e.target.value);
            }}
          />
          <span className="text-[12px] text-fg-muted">{t("dayOfMonthHint")}</span>
        </label>
      )}

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("hour")}</span>
        <Select
          options={HOUR_VALUES.map((h) => ({
            value: String(h),
            label: String(h).padStart(2, "0") + ":00",
          }))}
          value={hour}
          onValueChange={setHour}
          aria-label={t("hour")}
        />
        <span className="text-[12px] text-fg-muted">{t("hourHint")}</span>
      </label>

      <div className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("recipients")}</span>
        <ScheduleRecipientsInput value={recipients} onChange={setRecipients} />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={!canSubmit}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
