"use client";

import { formatTime as formatClock, type Locale } from "@newsekolah/i18n";
import {
  Avatar,
  Button,
  DataTable,
  EmptyState,
  FilteredEmptyState,
  Stat,
  StatGrid,
  StatusBadge,
  type DataTableFilterDef,
  type StatCategory,
  type StatusName,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, Clock, Pencil, Plane, UserCheck, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { type AttendanceRecord, type Employee, useStaffAttendanceTodayQuery } from "../api";

import { CorrectionDialog } from "./correction-dialog";
import { ManualEntryDialog } from "./manual-entry-dialog";

type StatusCode = AttendanceRecord["status_code"];

const STATUS_TOKEN: Partial<Record<StatusCode, StatusName>> = {
  present: "present",
  late: "late",
  absent: "absent",
};

const STATUS_CODES: StatusCode[] = [
  "present",
  "late",
  "absent",
  "on_leave",
  "incomplete",
  "holiday",
  "unscheduled",
];
const STATUS_FILTER_VALUES = ["", ...STATUS_CODES] as const;

/** The four figures the head reads first, each a filter for the table below. */
const SUMMARY: { code: StatusCode; icon: ReactNode; tone: StatCategory }[] = [
  { code: "present", icon: <UserCheck />, tone: "green" },
  { code: "late", icon: <Clock />, tone: "amber" },
  { code: "absent", icon: <UserX />, tone: "red" },
  { code: "on_leave", icon: <Plane />, tone: "blue" },
];

/**
 * One day of staff attendance at a glance: how many are present, late,
 * absent or on leave (each figure filters the table), then every employee
 * with a schedule, their status, arrival and departure, and minutes late
 * or early only where there are any. Correcting a record and adding a
 * manual one are here for those allowed to.
 */
export function TodayBoardView({
  date,
  today,
  employees,
  manualOpen,
  onManualOpenChange,
  onOpenSchedule,
}: {
  date: string;
  today: string;
  employees: Employee[];
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  onOpenSchedule: () => void;
}): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const locale = useLocale() as Locale;
  const timeZone = useSession().me?.tenant.timezone;
  const canManage = useCan("manage_staff_attendance");
  const canCorrect = useCan("correct_staff_attendance");
  const canSchedule = useCan("manage_staff_attendance_schedules");

  const board = useStaffAttendanceTodayQuery(date);
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);
  const [status, setStatus] = useUrlState<(typeof STATUS_FILTER_VALUES)[number]>(
    "status",
    STATUS_FILTER_VALUES,
    "",
  );

  const rows = useMemo(() => board.data?.data ?? [], [board.data]);
  const counts = useMemo(() => {
    const result: Partial<Record<StatusCode, number>> = {};
    for (const row of rows) result[row.status_code] = (result[row.status_code] ?? 0) + 1;
    return result;
  }, [rows]);
  const visible = status === "" ? rows : rows.filter((row) => row.status_code === status);

  const columns = useMemo<ColumnDef<AttendanceRecord>[]>(() => {
    const clock = (iso: string | null | undefined) =>
      iso ? formatClock(iso, { locale, timeZone }) : "–";
    const minutes = (value: number) => (value > 0 ? t("today.minutes", { minutes: value }) : "–");
    return [
      {
        accessorKey: "employee_name",
        header: t("today.columns.employee"),
        enableSorting: false,
        meta: { card: "title", skeleton: "avatar" },
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={row.original.employee_name} size={32} decorative />
            <span className="truncate">{row.original.employee_name}</span>
          </span>
        ),
      },
      {
        accessorKey: "status_code",
        header: t("today.columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => {
          const code = row.original.status_code;
          const token = STATUS_TOKEN[code];
          const label =
            code === "holiday" && row.original.holiday_name
              ? t("self.holidayWithName", { name: row.original.holiday_name })
              : t(`statuses.${code}`);
          return token ? (
            <StatusBadge status={token} label={label} />
          ) : (
            <span className="text-fg-muted">{label}</span>
          );
        },
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
      {
        accessorKey: "source",
        header: t("today.columns.source"),
        enableSorting: false,
        meta: { card: "hidden" },
        cell: ({ row }) => t(`sources.${row.original.source}`),
      },
      ...(canCorrect
        ? [
            {
              id: "actions",
              header: t("today.columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: AttendanceRecord } }) =>
                row.original.record_id ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil />}
                    aria-label={t("today.correctFor", { name: row.original.employee_name })}
                    onClick={() => {
                      setCorrecting(row.original);
                    }}
                  >
                    {t("today.correct")}
                  </Button>
                ) : null,
            } satisfies ColumnDef<AttendanceRecord>,
          ]
        : []),
    ];
  }, [t, canCorrect, locale, timeZone]);

  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("today.columns.status"),
      value: status,
      onChange: (value) => {
        setStatus(value as (typeof STATUS_FILTER_VALUES)[number]);
      },
      options: STATUS_CODES.map((code) => ({ value: code, label: t(`statuses.${code}`) })),
    },
  ];

  return (
    <>
      <StatGrid variant="tiles" aria-label={t("today.summaryLabel")}>
        {SUMMARY.map((item) => (
          <Stat
            key={item.code}
            icon={item.icon}
            tone={item.tone}
            label={t(`statuses.${item.code}`)}
            value={counts[item.code] ?? 0}
            loading={board.isLoading}
            onClick={() => {
              setStatus((current) => (current === item.code ? "" : item.code));
            }}
          />
        ))}
      </StatGrid>
      <DataTable
        stateKey="features/staff-attendance/components/today-board-view:1"
        mode="local"
        data={visible}
        columns={columns}
        rowCount={visible.length}
        filters={filters}
        filtersLabels={{
          reset: t("history.reset"),
          removeFilter: (label) => t("history.removeFilter", { label }),
        }}
        toolbarLabels={{ searchPlaceholder: t("today.searchPlaceholder") }}
        isLoading={board.isLoading}
        error={board.isError ? board.error : undefined}
        onRetry={() => void board.refetch()}
        retrying={board.isRefetching}
        getRowId={(r) => r.employee_user_id}
        emptyState={
          rows.length > 0 ? (
            <FilteredEmptyState
              onReset={() => {
                setStatus("");
              }}
            />
          ) : (
            <EmptyState
              icon={<CalendarClock />}
              title={t("today.emptyTitle")}
              description={t("today.emptyBody")}
              action={
                canSchedule ? (
                  <Button variant="secondary" onClick={onOpenSchedule}>
                    {t("today.openSchedule")}
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
      {canManage && (
        <ManualEntryDialog
          open={manualOpen}
          onOpenChange={onManualOpenChange}
          employees={employees}
          defaultDate={date}
          today={today}
        />
      )}
      {canCorrect && (
        <CorrectionDialog
          record={correcting}
          onOpenChange={(open) => {
            if (!open) setCorrecting(null);
          }}
        />
      )}
    </>
  );
}
