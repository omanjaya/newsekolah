"use client";

import { DataTable, EmptyState, StatusBadge, cn } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { FileBarChart } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { useMonthlyAttendanceSummaryQuery, type CalendarDay } from "../api";

import { STATUS_TOKEN } from "./attendance-report-options";

/**
 * One student's daily statuses for one month, with the per-status totals
 * above the table. Shared by the monthly report tab (where a picker
 * chooses the student) and the student profile's attendance tab.
 */
export function MonthlyAttendanceTable({
  studentId,
  month,
}: {
  studentId: string;
  month: string;
}): ReactElement {
  const t = useTranslations("app.attendanceReports.monthly");
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

  return (
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
  );
}
