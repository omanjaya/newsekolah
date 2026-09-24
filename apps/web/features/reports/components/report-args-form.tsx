"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useGradeLevelsQuery } from "../../academic/api-master-data";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import {
  downloadCustomReportExport,
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
 *
 * `attendance.daily` is the reportdoc reference implementation
 * (docs/05-shared-components.md "Laporan dan ekspor"): it renders
 * {@link AttendanceDailyExportForm} instead of the generic body below, so
 * it can offer the customisable {@link ReportExportDialog} (format,
 * letterhead, columns) and the grade-level scope. Every other report kind
 * is unchanged.
 */
export function ReportArgsForm({ report }: ReportArgsFormProps): ReactElement {
  if (report.kind === "attendance.daily") {
    return <AttendanceDailyExportForm report={report} />;
  }
  return <GenericReportArgsForm report={report} />;
}

const ATTENDANCE_DAILY_COLUMN_KEYS = [
  "no",
  "name",
  "status",
  "expected_sessions",
  "submitted_sessions",
  "complete",
] as const;

/**
 * The reference wiring for a customisable export: format/title/letterhead/
 * columns go through {@link ReportExportDialog}; the grade-level scope
 * (all classes of one grade level, one section per class) sits alongside
 * the existing per-class scope as a small radio choice, since the
 * catalogue's `class_id` argument is no longer the only way to scope this
 * report. See apps/web/features/reports/api.ts `downloadCustomReportExport`
 * for the query params this sends.
 */
function AttendanceDailyExportForm({ report }: { report: ReportDefinition }): ReactElement {
  const t = useTranslations("app.reports");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [scope, setScope] = useState<"class" | "gradeLevel">("class");
  const [classId, setClassId] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [date, setDate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const classes = useClassesQuery(true);
  const gradeLevels = useGradeLevelsQuery();

  const canOpenDialog = date !== "" && (scope === "class" ? classId !== "" : gradeLevelId !== "");

  const columns: ReportExportColumn[] = ATTENDANCE_DAILY_COLUMN_KEYS.map((key) => ({
    key,
    label: t(`attendanceDaily.columns.${key}`),
  }));

  async function handleExport(options: ReportExportOptions) {
    const args: ReportExportArgs = {
      date,
      ...(scope === "class" ? { class_id: classId } : { grade_level_id: gradeLevelId }),
    };
    try {
      await downloadCustomReportExport(report.kind, args, options);
    } catch (error) {
      if (error instanceof ApiError) toast.error(apiErrorMessage(error.code));
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("arguments.scope")}</span>
          <div role="radiogroup" aria-label={t("arguments.scope")} className="flex gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={scope === "class"}
              onClick={() => {
                setScope("class");
              }}
              className={`flex min-h-9 items-center rounded-sm border px-3 text-[13px] font-medium ${
                scope === "class"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-fg-muted"
              }`}
            >
              {t("arguments.scopeClass")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === "gradeLevel"}
              onClick={() => {
                setScope("gradeLevel");
              }}
              className={`flex min-h-9 items-center rounded-sm border px-3 text-[13px] font-medium ${
                scope === "gradeLevel"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-fg-muted"
              }`}
            >
              {t("arguments.scopeGradeLevel")}
            </button>
          </div>
        </div>
        {scope === "class" ? (
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
        ) : (
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("arguments.gradeLevel")}</span>
            <Select
              options={(gradeLevels.data?.data ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              value={gradeLevelId}
              onValueChange={setGradeLevelId}
              placeholder={t("arguments.gradeLevelPlaceholder")}
              disabled={gradeLevels.isLoading}
              aria-label={t("arguments.gradeLevel")}
              className="w-56"
            />
          </label>
        )}
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
      </div>
      <div>
        <Button
          size="sm"
          disabled={!canOpenDialog}
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          <Download className="size-4" aria-hidden="true" />
          {t("download")}
        </Button>
      </div>
      <ReportExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reportKey={report.kind}
        defaultTitle={t("attendanceDaily.defaultTitle")}
        availableColumns={columns}
        onExport={handleExport}
      />
    </div>
  );
}

function GenericReportArgsForm({ report }: { report: ReportDefinition }): ReactElement {
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
