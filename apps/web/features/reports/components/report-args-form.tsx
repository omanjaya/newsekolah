"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import {
  downloadReportExport,
  useReportTermsQuery,
  type ReportDefinition,
  type ReportExportArgs,
} from "../api";

interface ReportArgsFormProps {
  report: ReportDefinition;
}

/**
 * Renders only the controls the selected report declares. The parent keys
 * this component on `report.kind`, so switching reports remounts it and
 * clears any values left over from the previous selection.
 */
export function ReportArgsForm({ report }: ReportArgsFormProps): ReactElement {
  const t = useTranslations("app.reports");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const needsClass = report.arguments.some((a) => a.kind === "class");
  const needsSubject = report.arguments.some((a) => a.kind === "subject");
  const needsDate = report.arguments.some((a) => a.kind === "date");
  const needsTerm = report.arguments.some((a) => a.kind === "term");
  const requiredKinds = new Set(report.arguments.filter((a) => a.required).map((a) => a.kind));

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState("");
  const [termId, setTermId] = useState("");
  const [downloading, setDownloading] = useState(false);

  const classes = useClassesQuery(needsClass);
  const subjects = useSubjectsQuery(needsSubject);
  const terms = useReportTermsQuery(needsTerm);

  const canDownload =
    (!requiredKinds.has("class") || classId !== "") &&
    (!requiredKinds.has("subject") || subjectId !== "") &&
    (!requiredKinds.has("date") || date !== "") &&
    (!requiredKinds.has("term") || termId !== "");

  const args: ReportExportArgs = {
    ...(needsClass && classId ? { class_id: classId } : {}),
    ...(needsSubject && subjectId ? { subject_id: subjectId } : {}),
    ...(needsDate && date ? { date } : {}),
    ...(needsTerm && termId ? { term_id: termId } : {}),
  };

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadReportExport(report.kind, args);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {needsClass && (
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("arguments.class")}</span>
            <Select
              options={(classes.data?.data ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              value={classId}
              onValueChange={setClassId}
              placeholder={t("arguments.classPlaceholder")}
              disabled={classes.isLoading}
              aria-label={t("arguments.class")}
              className="w-56"
            />
          </label>
        )}
        {needsSubject && (
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("arguments.subject")}</span>
            <Select
              options={(subjects.data?.data ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              value={subjectId}
              onValueChange={setSubjectId}
              placeholder={t("arguments.subjectPlaceholder")}
              disabled={subjects.isLoading}
              aria-label={t("arguments.subject")}
              className="w-56"
            />
          </label>
        )}
        {needsDate && (
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("arguments.date")}</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
              }}
              aria-label={t("arguments.date")}
            />
          </label>
        )}
        {needsTerm && (
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("arguments.term")}</span>
            <Select
              options={(terms.data?.data ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              value={termId}
              onValueChange={setTermId}
              placeholder={t("arguments.termPlaceholder")}
              disabled={terms.isLoading}
              aria-label={t("arguments.term")}
              className="w-56"
            />
          </label>
        )}
      </div>
      <div>
        <Button
          size="sm"
          disabled={!canDownload}
          loading={downloading}
          onClick={() => {
            void handleDownload();
          }}
        >
          <Download className="size-4" aria-hidden="true" />
          {t("download")}
        </Button>
      </div>
    </div>
  );
}
