"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, DataTable, EmptyState, Input, Select, StatusBadge, cn } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileBarChart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  useClassEnrollmentsQuery,
  useClassesQuery,
  useDirectoryQuery,
  useGradeLevelsQuery,
} from "../../reference/api";
import {
  downloadMonthlyAttendanceReport,
  todayInZone,
  useMonthlyAttendanceSummaryQuery,
  type CalendarDay,
  type ReportScope,
} from "../api";

import { STATUS_TOKEN, classOptions } from "./attendance-report-options";
import { ReportScopePicker, scopeIsReady } from "./report-scope-picker";

/**
 * One student's daily statuses for one month, plus a monthly recap export
 * button (NIS, name, per-status counts, total, percentage present) for
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
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const apiErrorMessage = useApiErrorMessage();

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

  const report = useMonthlyAttendanceSummaryQuery(studentId, month, studentId !== "");

  const columns = useMemo<ColumnDef<CalendarDay>[]>(
    () => [
      { accessorKey: "date", header: t("columns.date"), enableSorting: false },
      {
        accessorKey: "status_code",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const code = row.original.status_code;
          const token = STATUS_TOKEN[code];
          return token ? (
            <StatusBadge status={token} label={t(`codes.${code}`)} />
          ) : (
            <span className="text-fg-muted">{t(`codes.${code}`)}</span>
          );
        },
      },
      {
        id: "sessions",
        header: t("columns.sessions"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className={cn(!row.original.complete && "text-status-late")}>
            {row.original.submitted_sessions}/{row.original.expected_sessions}
          </span>
        ),
      },
    ],
    [t],
  );

  const rows = (report.data?.data ?? []).filter((day) => day.status_code !== "NONE");

  async function handleRecapDownload() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadMonthlyAttendanceReport(month, downloadScope);
    } catch (error) {
      setDownloadError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDownloading(false);
    }
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
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border-subtle p-3">
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
        <Button
          size="sm"
          variant="secondary"
          disabled={!scopeIsReady(downloadScope) || month === ""}
          loading={downloading}
          onClick={() => void handleRecapDownload()}
        >
          <Download className="size-4" aria-hidden="true" />
          {t("downloadRecap")}
        </Button>
      </div>
      {downloadError && <p className="text-[13px] text-status-absent">{downloadError}</p>}

      {studentId === "" ? (
        <EmptyState
          icon={<FileBarChart aria-hidden="true" />}
          title={t("pickStudentTitle")}
          description={t("pickStudentBody")}
        />
      ) : (
        <>
          {report.data && (
            <dl className="flex flex-wrap gap-4 text-[13px]">
              {Object.entries(report.data.totals).map(([code, count]) => (
                <div key={code} className="flex items-center gap-1">
                  <dt className="text-fg-muted">{t(`codes.${code}`)}</dt>
                  <dd className="font-medium text-fg">{count}</dd>
                </div>
              ))}
            </dl>
          )}
          <DataTable
            stateKey="features/attendance/components/monthly-report-tab:1"
            mode="local"
            data={rows}
            columns={columns}
            rowCount={rows.length}
            pagination={{ pageIndex: 0, pageSize: 31 }}
            onPaginationChange={() => undefined}
            sorting={[]}
            onSortingChange={() => undefined}
            globalFilter=""
            isLoading={report.isLoading}
            getRowId={(r) => r.date}
            emptyState={
              <EmptyState icon={<FileBarChart aria-hidden="true" />} title={t("emptyTitle")} />
            }
          />
        </>
      )}
    </div>
  );
}
