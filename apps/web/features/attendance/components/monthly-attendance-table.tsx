"use client";

import { Badge, DataTable, EmptyState, StatusBadge, cn } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { FileBarChart } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { SHORT_DATE, formatCalendarDate } from "../../../lib/format-calendar-date";
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
  const format = useFormatter();
  const report = useMonthlyAttendanceSummaryQuery(studentId, month, studentId !== "");

  const columns = useMemo<ColumnDef<CalendarDay>[]>(
    () => [
      {
        accessorKey: "date",
        header: t("columns.date"),
        enableSorting: false,
        // "Sen, 5 Apr 2027" rather than the API's "2027-04-05"; the
        // weekday helps read a month of school days at a glance.
        cell: ({ row }) =>
          formatCalendarDate(format, row.original.date, { weekday: "short", ...SHORT_DATE }),
      },
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
            <Badge tone="neutral">{t(`codes.${code}`)}</Badge>
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
    [format, t],
  );

  const rows = (report.data?.data ?? []).filter((day) => day.status_code !== "NONE");

  return (
    <>
      {report.data && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Days with no lesson (weekends, and days still to come) are
              left out of the rows, so they are left out of the totals too. */}
          {Object.entries(report.data.totals)
            .filter(([code]) => code !== "NONE")
            .map(([code, count]) => (
              <Badge key={code} tone="neutral">
                {t(`codes.${code}`)} {count}
              </Badge>
            ))}
        </div>
      )}
      <DataTable
        stateKey="features/attendance/components/monthly-report-tab:1"
        mode="local"
        // One row per school day, read by status colour: nothing to search.
        searchable={false}
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 31 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={report.isLoading}
        error={report.isError ? report.error : undefined}
        onRetry={() => {
          void report.refetch();
        }}
        getRowId={(r) => r.date}
        emptyState={
          <EmptyState icon={<FileBarChart aria-hidden="true" />} title={t("emptyTitle")} />
        }
      />
    </>
  );
}
