"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate, formatTime, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  MonthPicker,
  SegmentedControl,
  Stat,
  StatGrid,
  StatusBadge,
  type DataTableFilterDef,
  type StatusName,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange, Clock, Download, LogOut, UserCheck, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import {
  ReportExportDialog,
  type ReportExportColumn,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  type AttendanceRecord,
  type Employee,
  downloadAllStaffAttendanceRecap,
  downloadStaffAttendanceRecap,
  todayInZone,
  useStaffAttendanceHistoryQuery,
  useStaffAttendanceRecapQuery,
} from "../api";

import { EmployeeCombobox } from "./employee-combobox";

/** Must match staffattendance/service/report.go's monthlyRecapColumns keys exactly. */
const RECAP_COLUMN_KEYS = [
  "date",
  "status",
  "arrival",
  "departure",
  "late_minutes",
  "early_leave_minutes",
  "source",
] as const;

const STATUS_TOKEN: Partial<Record<AttendanceRecord["status_code"], StatusName>> = {
  present: "present",
  late: "late",
  absent: "absent",
};

const VIEWS = ["month", "range"] as const;
type RecapView = (typeof VIEWS)[number];

function StatusCell({ code }: { code: AttendanceRecord["status_code"] }): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const token = STATUS_TOKEN[code];
  return token ? (
    <StatusBadge status={token} label={t(`statuses.${code}`)} />
  ) : (
    <Badge>{t(`statuses.${code}`)}</Badge>
  );
}

/**
 * One employee's attendance: a month at a time with its totals first
 * (present, late, absent, minutes late and left early) and the days
 * below, or any date range. The month exports for this employee or for
 * the whole staff.
 */
export function EmployeeRecapView({ employees }: { employees: Employee[] }): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const apiErrorMessage = useApiErrorMessage();
  const toast = useToast();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const [employeeId, setEmployeeId] = useState("");
  const today = todayInZone(timeZone);
  const [view, setView] = useUrlState<RecapView>("recap_view", VIEWS, "month");
  const [from, setFrom] = useDateFilter("from", today.slice(0, 8) + "01");
  const [to, setTo] = useDateFilter("to", today);
  const presets = useDateRangePresets();
  const [month, setMonth] = useDateFilter("month", today.slice(0, 7), true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAllOpen, setDialogAllOpen] = useState(false);

  const historyFilters: DataTableFilterDef[] = [
    {
      id: "period",
      label: t("history.dateRange"),
      type: "dateRange",
      from,
      to,
      onChangeRange: ({ from: nextFrom, to: nextTo }) => {
        setFrom(nextFrom);
        setTo(nextTo);
      },
      presets,
    },
  ];

  const recapColumns: ReportExportColumn[] = RECAP_COLUMN_KEYS.map((key) => ({
    key,
    label: t(`recap.columns.${key}`),
  }));

  const history = useStaffAttendanceHistoryQuery(view === "range" ? employeeId : "", from, to);
  const recap = useStaffAttendanceRecapQuery(view === "month" ? employeeId : "", month);

  const historyRows = history.data?.data ?? [];
  const recapData = recap.data;
  const totals = recapData?.status_totals ?? {};

  const columns = useMemo<ColumnDef<AttendanceRecord>[]>(() => {
    const clock = (iso: string | null | undefined) =>
      iso ? formatTime(iso, { locale, timeZone }) : "–";
    const minutes = (value: number | undefined) =>
      value !== undefined && value > 0 ? t("today.minutes", { minutes: value }) : "–";
    return [
      {
        accessorKey: "date",
        header: t("history.date"),
        enableSorting: false,
        meta: { card: "title" },
        // "YYYY-MM-DD" is a calendar day, not an instant: read it in UTC so no
        // browser timezone can move it to the neighbouring day.
        cell: ({ row }) => formatDate(row.original.date, { locale, timeZone: "UTC" }),
      },
      {
        accessorKey: "status_code",
        header: t("today.columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => <StatusCell code={row.original.status_code} />,
      },
      {
        id: "hours",
        header: t("today.columns.hours"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {t("today.hoursRange", {
              arrival: clock(row.original.arrival_at),
              departure: clock(row.original.departure_at),
            })}
          </span>
        ),
      },
      {
        accessorKey: "late_minutes",
        header: t("today.columns.late"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">{minutes(row.original.late_minutes)}</span>
        ),
      },
      {
        accessorKey: "early_leave_minutes",
        header: t("today.columns.early"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">{minutes(row.original.early_leave_minutes)}</span>
        ),
      },
    ];
  }, [t, locale, timeZone]);

  async function handleExport(options: ReportExportOptions) {
    if (employeeId === "") return;
    try {
      await downloadStaffAttendanceRecap(employeeId, month, options);
    } catch (error) {
      if (error instanceof ApiError) toast.error(apiErrorMessage(error.code));
      throw error;
    }
  }

  async function handleExportAll(options: ReportExportOptions) {
    try {
      await downloadAllStaffAttendanceRecap(month, options);
    } catch (error) {
      if (error instanceof ApiError) toast.error(apiErrorMessage(error.code));
      throw error;
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label={t("schedule.employee")} className="sm:w-72">
          <EmployeeCombobox
            employees={employees}
            value={employeeId}
            onValueChange={setEmployeeId}
          />
        </Field>
        <SegmentedControl<RecapView>
          aria-label={t("recap.viewLabel")}
          value={view}
          onValueChange={setView}
          options={[
            { value: "month", label: t("recap.byMonth") },
            { value: "range", label: t("recap.byRange") },
          ]}
        />
        {view === "month" && (
          <MonthPicker
            value={month}
            onChange={(next) => {
              if (next) setMonth(next);
            }}
            today={today}
            clearable={false}
            aria-label={t("recap.month")}
            className="sm:w-44"
          />
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {view === "month" && employeeId !== "" && (
            <Button
              variant="secondary"
              icon={<Download />}
              onClick={() => {
                setDialogOpen(true);
              }}
            >
              {t("recap.download")}
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<Download />}
            onClick={() => {
              setDialogAllOpen(true);
            }}
          >
            {t("recap.downloadAll")}
          </Button>
        </div>
      </div>

      <ReportExportDialog
        open={dialogAllOpen}
        onOpenChange={setDialogAllOpen}
        reportKey="staff-attendance.recap.all"
        defaultTitle={t("recap.defaultTitleAll")}
        availableColumns={recapColumns}
        onExport={handleExportAll}
      />
      <ReportExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reportKey="staff-attendance.recap"
        defaultTitle={t("recap.defaultTitle")}
        availableColumns={recapColumns}
        onExport={handleExport}
      />

      {employeeId === "" ? (
        <EmptyState
          icon={<CalendarRange />}
          title={t("recap.pickTitle")}
          description={t("recap.pickBody")}
        />
      ) : view === "month" ? (
        <>
          <StatGrid variant="strip" aria-label={t("recap.summaryLabel")}>
            <Stat
              icon={<UserCheck />}
              tone="green"
              label={t("statuses.present")}
              value={totals.present ?? 0}
              loading={recap.isLoading}
            />
            <Stat
              icon={<Clock />}
              tone="amber"
              label={t("statuses.late")}
              value={totals.late ?? 0}
              hint={
                recapData && recapData.total_late_minutes > 0
                  ? t("today.minutes", { minutes: recapData.total_late_minutes })
                  : undefined
              }
              loading={recap.isLoading}
            />
            <Stat
              icon={<UserX />}
              tone="red"
              label={t("statuses.absent")}
              value={totals.absent ?? 0}
              loading={recap.isLoading}
            />
            <Stat
              icon={<LogOut />}
              tone="blue"
              label={t("recap.totalEarly")}
              value={t("today.minutes", { minutes: recapData?.total_early_leave_minutes ?? 0 })}
              loading={recap.isLoading}
            />
          </StatGrid>
          <DataTable
            stateKey="features/staff-attendance/components/employee-recap-view:2"
            mode="local"
            data={recapData?.days ?? []}
            columns={columns}
            rowCount={recapData?.days.length ?? 0}
            searchable={false}
            isLoading={recap.isLoading}
            error={recap.isError ? recap.error : undefined}
            onRetry={() => void recap.refetch()}
            getRowId={(r) => r.date}
            emptyState={<EmptyState icon={<CalendarRange />} title={t("recap.empty")} />}
          />
        </>
      ) : (
        <DataTable
          stateKey="features/staff-attendance/components/employee-recap-view:1"
          mode="local"
          data={historyRows}
          columns={columns}
          rowCount={historyRows.length}
          searchable={false}
          filters={historyFilters}
          filtersLabels={{
            reset: t("history.reset"),
            removeFilter: (label) => t("history.removeFilter", { label }),
            dateRangeFrom: t("history.from"),
            dateRangeTo: t("history.to"),
            dateRangeInvalid: t("history.invalidRange"),
          }}
          isLoading={history.isLoading}
          error={history.isError ? history.error : undefined}
          onRetry={() => void history.refetch()}
          getRowId={(r) => r.date}
          emptyState={<EmptyState icon={<CalendarRange />} title={t("history.empty")} />}
        />
      )}
    </>
  );
}
