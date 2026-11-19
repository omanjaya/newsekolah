"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDateTime, type Locale } from "@newsekolah/i18n";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  RowActionsMenu,
  Switch,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, History, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
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
  const locale = useLocale() as Locale;
  const timeZone = useSession().me?.tenant.timezone;

  const { data, isLoading, isError, error, refetch, isRefetching } = useReportSchedulesQuery();
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

  // Names one schedule for the row's controls, so a screen reader can tell
  // the rows' switches and menus apart.
  const scheduleName = useCallback(
    (schedule: ReportSchedule): string =>
      t("scheduleName", {
        report: reportKindLabel(schedule.report_kind),
        cadence: cadenceLabel(schedule),
      }),
    [t, reportKindLabel, cadenceLabel],
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
        cell: ({ row }) => formatDateTime(row.original.next_run_at, { locale, timeZone }),
      },
      {
        id: "enabled",
        header: t("columns.enabled"),
        enableSorting: false,
        cell: ({ row }) => (
          <Switch
            checked={row.original.enabled}
            aria-label={t("enabledFor", { name: scheduleName(row.original) })}
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
        meta: { align: "end" },
        cell: ({ row }) => {
          const item = row.original;
          return (
            <RowActionsMenu
              ariaLabel={t("rowActions", { name: scheduleName(item) })}
              items={[
                {
                  label: t("viewHistory"),
                  icon: <History />,
                  onClick: () => {
                    setHistoryFor(item.id);
                  },
                },
                {
                  label: t("edit"),
                  icon: <Pencil />,
                  onClick: () => {
                    setEditing(item);
                  },
                },
                {
                  label: t("delete"),
                  icon: <Trash2 />,
                  tone: "danger",
                  onClick: () => {
                    setPendingDelete(item);
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [
      t,
      apiErrorMessage,
      toast,
      setEnabled,
      reportKindLabel,
      cadenceLabel,
      scheduleName,
      locale,
      timeZone,
    ],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm text-fg-muted">{t("description")}</p>
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
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        retrying={isRefetching}
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
