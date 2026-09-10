"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  StatusBadge,
  useToast,
  type StatusName,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Fingerprint, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type AttendanceRecord,
  type Employee,
  useScanStaffAttendanceMutation,
  useStaffAttendanceTodayQuery,
} from "../api";

import { CorrectionDialog } from "./correction-dialog";
import { ManualEntryDialog } from "./manual-entry-dialog";

const STATUS_TOKEN: Partial<Record<AttendanceRecord["status_code"], StatusName>> = {
  present: "present",
  late: "late",
  absent: "absent",
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function TodayBoardView({
  date,
  onDateChange,
  employees,
}: {
  date: string;
  onDateChange: (date: string) => void;
  employees: Employee[];
}): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_staff_attendance");
  const canCorrect = useCan("correct_staff_attendance");

  const board = useStaffAttendanceTodayQuery(date);
  const scanMutation = useScanStaffAttendanceMutation();
  const [manualOpen, setManualOpen] = useState(false);
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);

  const rows = board.data?.data ?? [];

  const columns = useMemo<ColumnDef<AttendanceRecord>[]>(
    () => [
      { accessorKey: "employee_name", header: t("today.columns.employee"), enableSorting: false },
      {
        accessorKey: "status_code",
        header: t("today.columns.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const code = row.original.status_code;
          const token = STATUS_TOKEN[code];
          return token ? (
            <StatusBadge status={token} label={t(`statuses.${code}`)} />
          ) : (
            <span className="text-fg-muted">{t(`statuses.${code}`)}</span>
          );
        },
      },
      {
        id: "arrival",
        header: t("today.columns.arrival"),
        enableSorting: false,
        cell: ({ row }) => formatTime(row.original.arrival_at),
      },
      {
        id: "departure",
        header: t("today.columns.departure"),
        enableSorting: false,
        cell: ({ row }) => formatTime(row.original.departure_at),
      },
      {
        accessorKey: "late_minutes",
        header: t("today.columns.late"),
        enableSorting: false,
      },
      {
        accessorKey: "early_leave_minutes",
        header: t("today.columns.early"),
        enableSorting: false,
      },
      {
        accessorKey: "source",
        header: t("today.columns.source"),
        enableSorting: false,
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
                    onClick={() => {
                      setCorrecting(row.original);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    {t("today.correct")}
                  </Button>
                ) : null,
            } satisfies ColumnDef<AttendanceRecord>,
          ]
        : []),
    ],
    [t, canCorrect],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("today.title")}</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              onDateChange(e.target.value);
            }}
            aria-label={t("today.title")}
            className="w-44"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={scanMutation.isPending}
            onClick={() => {
              scanMutation.mutate(undefined, {
                onSuccess: () => {
                  toast.success(t("today.scanSuccess"));
                },
                onError: (error) => {
                  toast.error(
                    error instanceof ApiError
                      ? apiErrorMessage(error.code)
                      : apiErrorMessage("UNKNOWN"),
                  );
                },
              });
            }}
          >
            <Fingerprint className="size-4" aria-hidden="true" />
            {t("today.scan")}
          </Button>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setManualOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("today.manualEntry")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-[13px] text-fg-muted">{t("today.subtitle")}</p>
      <DataTable
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={board.isLoading}
        getRowId={(r) => r.employee_user_id}
        emptyState={
          <EmptyState icon={<Fingerprint aria-hidden="true" />} title={t("today.empty")} />
        }
      />
      {canManage && (
        <ManualEntryDialog
          open={manualOpen}
          onOpenChange={setManualOpen}
          employees={employees}
          defaultDate={date}
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
    </div>
  );
}
