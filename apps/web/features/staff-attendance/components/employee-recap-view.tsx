"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  Select,
  StatusBadge,
  type StatusName,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AttendanceRecord,
  type Employee,
  downloadStaffAttendanceRecap,
  todayInZone,
  useStaffAttendanceHistoryQuery,
  useStaffAttendanceRecapQuery,
} from "../api";

const STATUS_TOKEN: Partial<Record<AttendanceRecord["status_code"], StatusName>> = {
  present: "present",
  late: "late",
  absent: "absent",
};

function StatusCell({ code }: { code: AttendanceRecord["status_code"] }): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const token = STATUS_TOKEN[code];
  return token ? (
    <StatusBadge status={token} label={t(`statuses.${code}`)} />
  ) : (
    <span className="text-fg-muted">{t(`statuses.${code}`)}</span>
  );
}

export function EmployeeRecapView({ employees }: { employees: Employee[] }): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const apiErrorMessage = useApiErrorMessage();

  const [employeeId, setEmployeeId] = useState("");
  const today = todayInZone();
  const [from, setFrom] = useDateFilter("from", today.slice(0, 8) + "01");
  const [to, setTo] = useDateFilter("to", today);
  const [month, setMonth] = useDateFilter("month", today.slice(0, 7), true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const history = useStaffAttendanceHistoryQuery(employeeId, from, to);
  const recap = useStaffAttendanceRecapQuery(employeeId, month);

  const historyRows = history.data?.data ?? [];
  const recapData = recap.data;

  const columns = useMemo<ColumnDef<AttendanceRecord>[]>(
    () => [
      { accessorKey: "date", header: t("history.date"), enableSorting: false },
      {
        accessorKey: "status_code",
        header: t("today.columns.status"),
        enableSorting: false,
        cell: ({ row }) => <StatusCell code={row.original.status_code} />,
      },
      { accessorKey: "late_minutes", header: t("today.columns.late"), enableSorting: false },
      {
        accessorKey: "early_leave_minutes",
        header: t("today.columns.early"),
        enableSorting: false,
      },
    ],
    [t],
  );

  async function handleDownload() {
    if (employeeId === "") return;
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadStaffAttendanceRecap(employeeId, month);
    } catch (error) {
      setDownloadError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("schedule.employee")}</span>
        <Select
          options={employees.map((e) => ({ value: e.id, label: e.name }))}
          value={employeeId}
          onValueChange={setEmployeeId}
          placeholder={t("schedule.employeePlaceholder")}
          className="w-72"
        />
      </label>

      {employeeId === "" ? (
        <EmptyState
          icon={<CalendarRange aria-hidden="true" />}
          title={t("schedule.employeePlaceholder")}
        />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-medium text-fg">{t("history.title")}</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="text-fg-muted">{t("history.from")}</span>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                  }}
                  className="w-44"
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="text-fg-muted">{t("history.to")}</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                  }}
                  className="w-44"
                />
              </label>
            </div>
            <DataTable
              stateKey="features/staff-attendance/components/employee-recap-view:1"
              mode="local"
              data={historyRows}
              columns={columns}
              rowCount={historyRows.length}
              pagination={{ pageIndex: 0, pageSize: 50 }}
              onPaginationChange={() => undefined}
              sorting={[]}
              onSortingChange={() => undefined}
              globalFilter=""
              isLoading={history.isLoading}
              getRowId={(r) => r.date}
              emptyState={
                <EmptyState
                  icon={<CalendarRange aria-hidden="true" />}
                  title={t("history.empty")}
                />
              }
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-medium text-fg">{t("recap.title")}</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="text-fg-muted">{t("recap.month")}</span>
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                  }}
                  className="w-44"
                />
              </label>
              <Button
                variant="secondary"
                size="sm"
                loading={downloading}
                onClick={() => void handleDownload()}
              >
                <Download className="size-4" aria-hidden="true" />
                {t("recap.download")}
              </Button>
            </div>
            {downloadError && <p className="text-[13px] text-status-absent">{downloadError}</p>}
            {recapData && recapData.days.length > 0 ? (
              <>
                <dl className="flex flex-wrap gap-4 text-[13px]">
                  <div className="flex items-center gap-1">
                    <dt className="text-fg-muted">{t("recap.totalLate")}</dt>
                    <dd className="font-medium text-fg">{recapData.total_late_minutes}</dd>
                  </div>
                  <div className="flex items-center gap-1">
                    <dt className="text-fg-muted">{t("recap.totalEarly")}</dt>
                    <dd className="font-medium text-fg">{recapData.total_early_leave_minutes}</dd>
                  </div>
                  {Object.entries(recapData.status_totals).map(([code, count]) => (
                    <div key={code} className="flex items-center gap-1">
                      <dt className="text-fg-muted">
                        {t(`statuses.${code as AttendanceRecord["status_code"]}`)}
                      </dt>
                      <dd className="font-medium text-fg">{count}</dd>
                    </div>
                  ))}
                </dl>
                <DataTable
                  stateKey="features/staff-attendance/components/employee-recap-view:2"
                  mode="local"
                  data={recapData.days}
                  columns={columns}
                  rowCount={recapData.days.length}
                  pagination={{ pageIndex: 0, pageSize: 50 }}
                  onPaginationChange={() => undefined}
                  sorting={[]}
                  onSortingChange={() => undefined}
                  globalFilter=""
                  isLoading={recap.isLoading}
                  getRowId={(r) => r.date}
                  emptyState={
                    <EmptyState
                      icon={<CalendarRange aria-hidden="true" />}
                      title={t("recap.empty")}
                    />
                  }
                />
              </>
            ) : (
              <EmptyState icon={<CalendarRange aria-hidden="true" />} title={t("recap.empty")} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
