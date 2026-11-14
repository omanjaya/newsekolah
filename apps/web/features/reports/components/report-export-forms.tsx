"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, DatePicker, Field, SegmentedControl, Select, useToast } from "@newsekolah/ui";
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
import { useClassesQuery } from "../../reference/api";
import { downloadCustomReportExport, type ReportDefinition, type ReportExportArgs } from "../api";

export const DISCIPLINE_WARNING_LETTERS_COLUMN_KEYS = [
  "no",
  "letter_number",
  "student_name",
  "level",
  "total_points",
  "issued_at",
] as const;

export const PERMITS_LEAVE_REQUESTS_COLUMN_KEYS = [
  "no",
  "student_name",
  "class_name",
  "category",
  "starts_on",
  "ends_on",
  "letter_number",
  "status",
] as const;

export const PERMITS_EXIT_PERMITS_YEARLY_COLUMN_KEYS = [
  "no",
  "student_name",
  "class_name",
  "destination",
  "opened_at",
  "status",
  "exited_at",
] as const;

/**
 * Export form for a report whose class argument is optional (points/
 * warning letters/leave requests scoped to nothing means "every class")
 * and whose columns are fully static: the "Kelas atau Angkatan" scope
 * picker alongside {@link ReportExportDialog}.
 */
export function ClassScopedExportForm({
  report,
  messageNamespace,
  columnKeys,
}: {
  report: ReportDefinition;
  messageNamespace: "disciplineWarningLetters" | "permitsLeaveRequests";
  columnKeys: readonly string[];
}): ReactElement {
  const t = useTranslations("app.reports");
  const tColumns = useTranslations(`app.reports.${messageNamespace}`);
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [scopeType, setScopeType] = useState<"class" | "gradeLevel" | "none">("none");
  const [classId, setClassId] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const classes = useClassesQuery(scopeType === "class");
  const gradeLevels = useGradeLevelsQuery();

  const columns: ReportExportColumn[] = columnKeys.map((key) => ({
    key,
    label: tColumns(`columns.${key}`),
  }));

  async function handleExport(options: ReportExportOptions) {
    const args: ReportExportArgs = {
      ...(scopeType === "class" && classId ? { class_id: classId } : {}),
      ...(scopeType === "gradeLevel" && gradeLevelId ? { grade_level_id: gradeLevelId } : {}),
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
        <Field label={t("arguments.scopeType")}>
          <Select
            options={[
              { value: "none", label: t("arguments.scopeTypeAll") },
              { value: "class", label: t("arguments.scopeTypeClass") },
              { value: "gradeLevel", label: t("arguments.scopeTypeGradeLevel") },
            ]}
            value={scopeType}
            onValueChange={(v) => {
              setScopeType(v as "class" | "gradeLevel" | "none");
            }}
            aria-label={t("arguments.scopeType")}
            className="w-40"
          />
        </Field>
        {scopeType === "class" && (
          <Field label={t("arguments.class")}>
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
          </Field>
        )}
        {scopeType === "gradeLevel" && (
          <Field label={t("arguments.gradeLevel")}>
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
          </Field>
        )}
      </div>
      <div>
        <Button
          size="sm"
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
        defaultTitle={tColumns("defaultTitle")}
        availableColumns={columns}
        onExport={handleExport}
      />
    </div>
  );
}

/**
 * Export form for a report with no scope arguments at all
 * (permits.exit_permits_yearly): just the {@link ReportExportDialog}
 * behind the download button.
 */
export function UnscopedExportForm({
  report,
  messageNamespace,
  columnKeys,
}: {
  report: ReportDefinition;
  messageNamespace: "permitsExitPermitsYearly";
  columnKeys: readonly string[];
}): ReactElement {
  const t = useTranslations("app.reports");
  const tColumns = useTranslations(`app.reports.${messageNamespace}`);
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [dialogOpen, setDialogOpen] = useState(false);

  const columns: ReportExportColumn[] = columnKeys.map((key) => ({
    key,
    label: tColumns(`columns.${key}`),
  }));

  async function handleExport(options: ReportExportOptions) {
    try {
      await downloadCustomReportExport(report.kind, {}, options);
    } catch (error) {
      if (error instanceof ApiError) toast.error(apiErrorMessage(error.code));
      throw error;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          size="sm"
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
        defaultTitle={tColumns("defaultTitle")}
        availableColumns={columns}
        onExport={handleExport}
      />
    </div>
  );
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
export function AttendanceDailyExportForm({ report }: { report: ReportDefinition }): ReactElement {
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
        <Field label={t("arguments.scope")}>
          {(control) => (
            <SegmentedControl
              aria-labelledby={control.labelId}
              options={[
                { value: "class", label: t("arguments.scopeClass") },
                { value: "gradeLevel", label: t("arguments.scopeGradeLevel") },
              ]}
              value={scope}
              onValueChange={(value) => {
                setScope(value);
              }}
            />
          )}
        </Field>
        {scope === "class" ? (
          <Field label={t("arguments.class")}>
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
          </Field>
        ) : (
          <Field label={t("arguments.gradeLevel")}>
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
          </Field>
        )}
        <Field label={t("arguments.date")}>
          <DatePicker value={date === "" ? null : date} onChange={setDate} className="w-48" />
        </Field>
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
