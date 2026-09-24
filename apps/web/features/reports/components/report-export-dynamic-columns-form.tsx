"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Select, useToast } from "@newsekolah/ui";
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
  useReportColumns,
  useReportTermsQuery,
  type ReportDefinition,
  type ReportExportArgs,
} from "../api";

/**
 * Export form for a report whose columns are not fully static --
 * discipline.points' one column per tenant-configured SP level,
 * grading.report_scores' one per assessment component -- so
 * {@link ReportExportDialog}'s column list is fetched from
 * `GET /v1/reports/{reportKind}/columns` for the chosen scope right
 * before opening the dialog, instead of a key/label list declared ahead
 * of time (see ./report-export-forms.tsx's static-column forms).
 */
export function DynamicColumnsExportForm({
  report,
  messageNamespace,
  allowsNoScope,
  needsSubject,
  needsTerm,
}: {
  report: ReportDefinition;
  messageNamespace: "disciplinePoints" | "gradingReportScores";
  /** Whether this kind's class argument is optional (unscoped means "every class"). */
  allowsNoScope: boolean;
  needsSubject: boolean;
  needsTerm: boolean;
}): ReactElement {
  const t = useTranslations("app.reports");
  const tColumns = useTranslations(`app.reports.${messageNamespace}`);
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const fetchColumns = useReportColumns();

  const [scopeType, setScopeType] = useState<"class" | "gradeLevel" | "none">(
    allowsNoScope ? "none" : "class",
  );
  const [classId, setClassId] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [columns, setColumns] = useState<ReportExportColumn[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const classes = useClassesQuery(scopeType === "class");
  const gradeLevels = useGradeLevelsQuery();
  const subjects = useSubjectsQuery(needsSubject);
  const terms = useReportTermsQuery(needsTerm);

  const scopeFilled =
    scopeType === "class"
      ? classId !== ""
      : scopeType === "gradeLevel"
        ? gradeLevelId !== ""
        : true;
  const canDownload = scopeFilled && (!needsSubject || subjectId !== "");

  function currentArgs(): ReportExportArgs {
    return {
      ...(scopeType === "class" && classId ? { class_id: classId } : {}),
      ...(scopeType === "gradeLevel" && gradeLevelId ? { grade_level_id: gradeLevelId } : {}),
      ...(needsSubject && subjectId ? { subject_id: subjectId } : {}),
      ...(needsTerm && termId ? { term_id: termId } : {}),
    };
  }

  async function openDialog() {
    setLoadingColumns(true);
    try {
      const fetched = await fetchColumns(report.kind, currentArgs());
      setColumns(fetched.map((c) => ({ key: c.key, label: c.label })));
      setDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setLoadingColumns(false);
    }
  }

  async function handleExport(options: ReportExportOptions) {
    try {
      await downloadCustomReportExport(report.kind, currentArgs(), options);
    } catch (error) {
      if (error instanceof ApiError) toast.error(apiErrorMessage(error.code));
      throw error;
    }
  }

  const scopeOptions = allowsNoScope
    ? [
        { value: "none", label: t("arguments.scopeTypeAll") },
        { value: "class", label: t("arguments.scopeTypeClass") },
        { value: "gradeLevel", label: t("arguments.scopeTypeGradeLevel") },
      ]
    : [
        { value: "class", label: t("arguments.scopeTypeClass") },
        { value: "gradeLevel", label: t("arguments.scopeTypeGradeLevel") },
      ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("arguments.scopeType")}</span>
          <Select
            options={scopeOptions}
            value={scopeType}
            onValueChange={(v) => {
              setScopeType(v as "class" | "gradeLevel" | "none");
            }}
            aria-label={t("arguments.scopeType")}
            className="w-40"
          />
        </label>
        {scopeType === "class" && (
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
        {scopeType === "gradeLevel" && (
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
          loading={loadingColumns}
          onClick={() => {
            void openDialog();
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
        defaultTitle={tColumns("defaultTitle")}
        availableColumns={columns}
        onExport={handleExport}
      />
    </div>
  );
}
