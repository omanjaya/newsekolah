"use client";

import { Button, DataTable, EmptyState, Input, Select, StatusBadge, cn } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
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
import { useClassesQuery, useGradeLevelsQuery } from "../../reference/api";
import {
  downloadDailyAttendanceReport,
  todayInZone,
  useDailyAttendanceReportQuery,
  type ReportScope,
  type RosterEntry,
} from "../api";

import { AttendanceDailySessions } from "./attendance-daily-sessions";
import {
  DAILY_REPORT_EXPORT_COLUMNS,
  STATUS_TOKEN,
  classOptions,
} from "./attendance-report-options";
import { ReportScopePicker, scopeIsReady } from "./report-scope-picker";

/**
 * One class's expected-vs-submitted counts and per-student daily status
 * for one date, plus an export dialog that downloads either the same
 * class or every class of a grade level ("angkatan") as XLSX or PDF.
 */
export function DailyReportTab(): ReactElement {
  const t = useTranslations("app.attendanceReports.daily");
  const { me } = useSession();

  const [classId, setClassId] = useState("");
  const [date, setDate] = useDateFilter("date", todayInZone(me?.tenant.timezone));
  const [downloadScope, setDownloadScope] = useState<ReportScope>({ kind: "class", classId: "" });
  const [exportOpen, setExportOpen] = useState(false);

  const classes = useClassesQuery();
  const gradeLevels = useGradeLevelsQuery();
  const report = useDailyAttendanceReportQuery(date, classId, classId !== "");

  const rows = report.data?.students ?? [];

  const columns = useMemo<ColumnDef<RosterEntry>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        accessorKey: "status_code",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const code = row.original.status_code;
          const token = STATUS_TOKEN[code];
          return (
            <div className="flex items-center gap-2">
              {token ? (
                <StatusBadge status={token} label={t(`codes.${code}`)} />
              ) : (
                <span className="text-fg-muted">{t(`codes.${code}`)}</span>
              )}
              {row.original.partial_absence && (
                <span className="text-[12px] text-status-absent" title={t("partialAbsenceHint")}>
                  {t("partialAbsence")}
                </span>
              )}
            </div>
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

  async function handleExport(options: ReportExportOptions) {
    await downloadDailyAttendanceReport(date, downloadScope, options);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("class")}</span>
          <Select
            options={classOptions(classes.data?.data)}
            value={classId}
            onValueChange={setClassId}
            placeholder={t("classPlaceholder")}
            disabled={classes.isLoading}
            aria-label={t("class")}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("date")}</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
            aria-label={t("date")}
            className="w-44"
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
          {t("download")}
        </Button>
      </div>

      <ReportExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        reportKey="attendance.daily"
        defaultTitle={t("exportTitle")}
        availableColumns={DAILY_REPORT_EXPORT_COLUMNS}
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

      {classId === "" ? (
        <EmptyState
          icon={<FileBarChart aria-hidden="true" />}
          title={t("pickClassTitle")}
          description={t("pickClassBody")}
        />
      ) : (
        <>
          {report.data && (
            <dl className="flex flex-wrap gap-4 text-[13px]">
              <div className="flex items-center gap-1">
                <dt className="text-fg-muted">{t("summarySubmitted")}</dt>
                <dd className="font-medium text-fg">
                  {report.data.submitted_sessions}/{report.data.expected_sessions}
                </dd>
              </div>
              {Object.entries(report.data.status_counts).map(([code, count]) => (
                <div key={code} className="flex items-center gap-1">
                  <dt className="text-fg-muted">{t(`codes.${code}`)}</dt>
                  <dd className="font-medium text-fg">{count}</dd>
                </div>
              ))}
            </dl>
          )}
          <DataTable
            stateKey="features/attendance/components/daily-report-tab:1"
            mode="local"
            data={rows}
            columns={columns}
            rowCount={rows.length}
            pagination={{ pageIndex: 0, pageSize: 50 }}
            onPaginationChange={() => undefined}
            sorting={[]}
            onSortingChange={() => undefined}
            globalFilter=""
            isLoading={report.isLoading}
            getRowId={(r) => r.student_user_id}
            emptyState={
              <EmptyState icon={<FileBarChart aria-hidden="true" />} title={t("emptyTitle")} />
            }
          />
          <AttendanceDailySessions sessions={report.data?.sessions ?? []} />
        </>
      )}
    </div>
  );
}
