"use client";

import {
  Badge,
  Button,
  DataTable,
  DatePicker,
  EmptyState,
  Field,
  Select,
  StatusBadge,
  cn,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileBarChart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import {
  ReportExportDialog,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { SHORT_DATE } from "../../../lib/format-calendar-date";
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
import { dailyReportExportColumns, STATUS_TOKEN, classOptions } from "./attendance-report-options";
import { ReportScopePicker, scopeIsReady } from "./report-scope-picker";

/**
 * One class's expected-vs-submitted counts and per-student daily status
 * for one date, plus an export dialog that downloads either the same
 * class or every class of a grade level ("angkatan") as XLSX or PDF.
 */
export function DailyReportTab(): ReactElement {
  const t = useTranslations("app.attendanceReports.daily");
  const tColumns = useTranslations("app.attendanceReports.exportColumns");
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
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
      },
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
                <Badge tone="neutral">{t(`codes.${code}`)}</Badge>
              )}
              {row.original.partial_absence && (
                <span
                  className="text-caption font-normal text-status-absent"
                  title={t("partialAbsenceHint")}
                >
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
          <span className={cn(!row.original.complete && "text-warning")}>
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
      {/* Two fields side by side and the download under them on a phone;
          one row from 640px, the download at its end. */}
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <Field label={t("class")}>
          <Select
            options={classOptions(classes.data?.data)}
            value={classId}
            onValueChange={setClassId}
            placeholder={t("classPlaceholder")}
            disabled={classes.isLoading}
            aria-label={t("class")}
            className="w-full sm:w-56"
          />
        </Field>
        <Field label={t("date")}>
          <DatePicker
            value={date}
            onChange={setDate}
            clearable={false}
            formatOptions={SHORT_DATE}
            className="w-full sm:w-44"
          />
        </Field>
        <Button
          variant="secondary"
          icon={<Download />}
          className="col-span-2 sm:ml-auto"
          onClick={() => {
            // Start the export from the class on screen.
            if (classId !== "") setDownloadScope({ kind: "class", classId });
            setExportOpen(true);
          }}
        >
          {t("download")}
        </Button>
      </div>

      <ReportExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        reportKey="attendance.daily"
        defaultTitle={t("exportTitle")}
        availableColumns={dailyReportExportColumns(tColumns)}
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
              <p className="text-body-sm text-fg-muted">{t("exportScopeHint")}</p>
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
            <div className="flex flex-wrap items-center gap-2" data-testid="daily-report-counts">
              <Badge tone="neutral">
                {t("summarySubmitted")} {report.data.submitted_sessions}/
                {report.data.expected_sessions}
              </Badge>
              {Object.entries(report.data.status_counts).map(([code, count]) => (
                <Badge key={code} tone="neutral">
                  {t(`codes.${code}`)} {count}
                </Badge>
              ))}
            </div>
          )}
          <DataTable
            toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
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
            error={report.isError ? report.error : undefined}
            onRetry={() => {
              void report.refetch();
            }}
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
