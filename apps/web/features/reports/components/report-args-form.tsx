"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useGradeLevelsQuery } from "../../academic/api-master-data";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import {
  downloadReportExport,
  useReportTermsQuery,
  type ReportDefinition,
  type ReportExportArgs,
} from "../api";

import { DynamicColumnsExportForm } from "./report-export-dynamic-columns-form";
import {
  AttendanceDailyExportForm,
  ClassScopedExportForm,
  DISCIPLINE_WARNING_LETTERS_COLUMN_KEYS,
  PERMITS_EXIT_PERMITS_YEARLY_COLUMN_KEYS,
  PERMITS_LEAVE_REQUESTS_COLUMN_KEYS,
  UnscopedExportForm,
} from "./report-export-forms";

interface ReportArgsFormProps {
  report: ReportDefinition;
}

/**
 * Renders only the controls the selected report declares. The parent keys
 * this component on `report.kind`, so switching reports remounts it and
 * clears any values left over from the previous selection.
 *
 * Every kind renders one of the dedicated `*ExportForm` components below,
 * offering the customisable ReportExportDialog (format, letterhead,
 * columns) alongside its "Kelas atau Angkatan" scope picker.
 * discipline.points and grading.report_scores go through
 * {@link DynamicColumnsExportForm} instead of a static column list: their
 * column set includes one column per tenant-configured SP level / per
 * assessment component, fetched from GET /v1/reports/{reportKind}/columns
 * for the chosen scope right before the dialog opens.
 */
export function ReportArgsForm({ report }: ReportArgsFormProps): ReactElement {
  switch (report.kind) {
    case "attendance.daily":
      return <AttendanceDailyExportForm report={report} />;
    case "discipline.points":
      return (
        <DynamicColumnsExportForm
          report={report}
          messageNamespace="disciplinePoints"
          allowsNoScope
          needsSubject={false}
          needsTerm={false}
        />
      );
    case "discipline.warning_letters":
      return (
        <ClassScopedExportForm
          report={report}
          messageNamespace="disciplineWarningLetters"
          columnKeys={DISCIPLINE_WARNING_LETTERS_COLUMN_KEYS}
        />
      );
    case "grading.report_scores":
      return (
        <DynamicColumnsExportForm
          report={report}
          messageNamespace="gradingReportScores"
          allowsNoScope={false}
          needsSubject
          needsTerm
        />
      );
    case "permits.leave_requests":
      return (
        <ClassScopedExportForm
          report={report}
          messageNamespace="permitsLeaveRequests"
          columnKeys={PERMITS_LEAVE_REQUESTS_COLUMN_KEYS}
        />
      );
    case "permits.exit_permits_yearly":
      return (
        <UnscopedExportForm
          report={report}
          messageNamespace="permitsExitPermitsYearly"
          columnKeys={PERMITS_EXIT_PERMITS_YEARLY_COLUMN_KEYS}
        />
      );
    default:
      return <GenericReportArgsForm report={report} />;
  }
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

  // A report scoped to "class" can run against one class or a whole grade
  // level (one section per class in it) -- class_id and grade_level_id are
  // mutually exclusive, so only one control is shown at a time.
  const [scopeType, setScopeType] = useState<"class" | "gradeLevel">("class");
  const [classId, setClassId] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState("");
  const [termId, setTermId] = useState("");
  const [downloading, setDownloading] = useState(false);

  const classes = useClassesQuery(needsClass && scopeType === "class");
  const gradeLevels = useGradeLevelsQuery();
  const subjects = useSubjectsQuery(needsSubject);
  const terms = useReportTermsQuery(needsTerm);

  const scopeFilled = scopeType === "class" ? classId !== "" : gradeLevelId !== "";
  const canDownload =
    (!requiredKinds.has("class") || scopeFilled) &&
    (!requiredKinds.has("subject") || subjectId !== "") &&
    (!requiredKinds.has("date") || date !== "") &&
    (!requiredKinds.has("term") || termId !== "");

  const args: ReportExportArgs = {
    ...(needsClass && scopeType === "class" && classId ? { class_id: classId } : {}),
    ...(needsClass && scopeType === "gradeLevel" && gradeLevelId
      ? { grade_level_id: gradeLevelId }
      : {}),
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
          <>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-fg">{t("arguments.scopeType")}</span>
              <Select
                options={[
                  { value: "class", label: t("arguments.scopeTypeClass") },
                  { value: "gradeLevel", label: t("arguments.scopeTypeGradeLevel") },
                ]}
                value={scopeType}
                onValueChange={(v) => {
                  setScopeType(v as "class" | "gradeLevel");
                }}
                aria-label={t("arguments.scopeType")}
                className="w-40"
              />
            </label>
            {scopeType === "class" ? (
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
          </>
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
