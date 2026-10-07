"use client";

import { Button, EmptyState, Input, Select } from "@newsekolah/ui";
import { Download, FileBarChart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import {
  ReportExportDialog,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useSession } from "../../../lib/session/session-provider";
import {
  useClassEnrollmentsQuery,
  useClassesQuery,
  useDirectoryQuery,
  useGradeLevelsQuery,
} from "../../reference/api";
import { downloadMonthlyAttendanceReport, todayInZone, type ReportScope } from "../api";

import { MONTHLY_RECAP_EXPORT_COLUMNS, classOptions } from "./attendance-report-options";
import { MonthlyAttendanceTable } from "./monthly-attendance-table";
import { ReportScopePicker, scopeIsReady } from "./report-scope-picker";

/**
 * One student's daily statuses for one month, plus a monthly recap export
 * dialog (NIS, name, per-status counts, total, percentage present) for
 * either one class or every class of a grade level ("angkatan") --
 * unlike the on-screen calendar above it, which is always one student.
 */
export function MonthlyReportTab(): ReactElement {
  const t = useTranslations("app.attendanceReports.monthly");
  const { me } = useSession();

  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [month, setMonth] = useDateFilter(
    "month",
    todayInZone(me?.tenant.timezone).slice(0, 7),
    true,
  );
  const [downloadScope, setDownloadScope] = useState<ReportScope>({ kind: "class", classId: "" });
  const [exportOpen, setExportOpen] = useState(false);

  const classes = useClassesQuery();
  const gradeLevels = useGradeLevelsQuery();
  const enrollments = useClassEnrollmentsQuery(classId, classId !== "");
  const students = useDirectoryQuery("student");
  const studentMap = useMemo(
    () => new Map((students.data?.data ?? []).map((s) => [s.id, s.name])),
    [students.data],
  );
  const studentOptions = useMemo(() => {
    const ids = new Set((enrollments.data?.data ?? []).map((e) => e.student_user_id));
    return [...ids]
      .map((id) => ({ value: id, label: studentMap.get(id) ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [enrollments.data, studentMap]);

  async function handleExport(options: ReportExportOptions) {
    await downloadMonthlyAttendanceReport(month, downloadScope, options);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("class")}</span>
          <Select
            options={classOptions(classes.data?.data)}
            value={classId}
            onValueChange={(value) => {
              setClassId(value);
              setStudentId("");
            }}
            placeholder={t("classPlaceholder")}
            disabled={classes.isLoading}
            aria-label={t("class")}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("student")}</span>
          <Select
            options={studentOptions}
            value={studentId}
            onValueChange={setStudentId}
            placeholder={t("studentPlaceholder")}
            disabled={classId === "" || enrollments.isLoading}
            aria-label={t("student")}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("month")}</span>
          <Input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
            }}
            aria-label={t("month")}
            className="w-40"
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setExportOpen(true);
          }}
        >
          <Download className="size-4" aria-hidden="true" />
          {t("downloadRecap")}
        </Button>
      </div>

      <ReportExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        reportKey="attendance.monthly-recap"
        defaultTitle={t("exportTitle")}
        availableColumns={MONTHLY_RECAP_EXPORT_COLUMNS}
        onExport={handleExport}
        scopeSlot={
          <div className="flex flex-col gap-2">
            <ReportScopePicker
              scope={downloadScope}
              onScopeChange={setDownloadScope}
              classes={classes.data?.data}
              gradeLevels={gradeLevels.data?.data}
              classesLoading={classes.isLoading}
              gradeLevelsLoading={gradeLevels.isLoading}
              classLabel={t("class")}
              gradeLevelLabel={t("gradeLevel")}
              classPlaceholder={t("classPlaceholder")}
              gradeLevelPlaceholder={t("gradeLevelPlaceholder")}
            />
            {!scopeIsReady(downloadScope) && (
              <p className="text-[13px] text-fg-muted">{t("exportScopeHint")}</p>
            )}
          </div>
        }
      />

      {studentId === "" ? (
        <EmptyState
          icon={<FileBarChart aria-hidden="true" />}
          title={t("pickStudentTitle")}
          description={t("pickStudentBody")}
        />
      ) : (
        <MonthlyAttendanceTable studentId={studentId} month={month} />
      )}
    </div>
  );
}
