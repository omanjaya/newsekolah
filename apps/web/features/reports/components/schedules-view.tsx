"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Switch,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, History, MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useDeleteReportScheduleMutation,
  useReportSchedulesQuery,
  useSetReportScheduleEnabledMutation,
  type ReportSchedule,
} from "../api";

import { ScheduleForm } from "./schedule-form";
import { ScheduleRunHistoryDialog } from "./schedule-run-history-dialog";

/**
 * Recurring exports configured for this tenant: a schedule renders one
 * catalogue report on a cadence and emails the download link to its
 * recipients (apps/api/internal/modules/reports/transport/jobs runs the
 * hourly scan). This view only manages the schedule rows; the actual
 * send happens server-side.
 */
export function SchedulesView(): ReactElement {
  const t = useTranslations("app.reports.schedules");
  const tKinds = useTranslations("app.reports.kinds");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading } = useReportSchedulesQuery();
  const setEnabled = useSetReportScheduleEnabledMutation();
  const remove = useDeleteReportScheduleMutation();

  const [editing, setEditing] = useState<ReportSchedule | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReportSchedule | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const items = data?.data ?? [];

  const reportKindLabel = useCallback(
    (kind: string): string => {
      const kindKey = kind.replaceAll(".", "_");
      return tKinds.has(`${kindKey}.label`) ? tKinds(`${kindKey}.label`) : kind;
    },
    [tKinds],
  );

  const cadenceLabel = useCallback(
    (schedule: ReportSchedule): string => {
      switch (schedule.cadence) {
        case "daily":
          return t("cadenceSummary.daily", { hour: String(schedule.hour).padStart(2, "0") });
        case "weekly":
          return t("cadenceSummary.weekly", {
            weekday: t(`form.weekdayName.${schedule.weekday ?? 0}`),
            hour: String(schedule.hour).padStart(2, "0"),
          });
        case "monthly":
          return t("cadenceSummary.monthly", {
            day: schedule.day_of_month ?? 1,
            hour: String(schedule.hour).padStart(2, "0"),
          });
        default:
          return "";
      }
    },
    [t],
  );

  const columns = useMemo<ColumnDef<ReportSchedule>[]>(
    () => [
      {
        accessorKey: "report_kind",
        header: t("columns.report"),
        enableSorting: false,
        cell: ({ row }) => reportKindLabel(row.original.report_kind),
      },
      {
        id: "cadence",
        header: t("columns.cadence"),
        enableSorting: false,
        cell: ({ row }) => cadenceLabel(row.original),
      },
      {
        accessorKey: "recipients",
        header: t("columns.recipients"),
        enableSorting: false,
        cell: ({ row }) => row.original.recipients.join(", "),
      },
      {
        id: "next_run_at",
        header: t("columns.nextRun"),
        enableSorting: false,
        cell: ({ row }) => new Date(row.original.next_run_at).toLocaleString(),
      },
      {
        id: "enabled",
        header: t("columns.enabled"),
        enableSorting: false,
        cell: ({ row }) => (
          <Switch
            checked={row.original.enabled}
            aria-label={t("columns.enabled")}
            onCheckedChange={(checked) => {
              setEnabled.mutate(
                { id: row.original.id, enabled: checked },
                {
                  onError: (error) => {
                    toast.error(
                      error instanceof ApiError
                        ? apiErrorMessage(error.code)
                        : apiErrorMessage("UNKNOWN"),
                    );
                  },
                },
              );
            }}
          />
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-1">
              <IconButton
                icon={<History />}
                aria-label={t("viewHistory")}
                onClick={() => {
                  setHistoryFor(item.id);
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton icon={<MoreHorizontal />} aria-label={t("columns.actions")} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(item);
                    }}
                  >
                    {t("edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setPendingDelete(item);
                    }}
                  >
                    {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [t, apiErrorMessage, toast, setEnabled, reportKindLabel, cadenceLabel],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-fg-muted">{t("description")}</p>
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            setEditing("new");
          }}
        >
          {t("add")}
        </Button>
      </div>

      <DataTable
        stateKey="features/reports/components/schedules-view:1"
        mode="local"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<CalendarClock aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}>
          {editing !== null && (
            <ScheduleForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ScheduleRunHistoryDialog
        scheduleId={historyFor}
        onClose={() => {
          setHistoryFor(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={
          pendingDelete
            ? t("deleteBody", { report: reportKindLabel(pendingDelete.report_kind) })
            : ""
        }
        confirmLabel={t("delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
