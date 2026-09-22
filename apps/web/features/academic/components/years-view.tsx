"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  Switch,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, CalendarRange, CircleCheck, Pencil, Plus, Rows3 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import {
  type AcademicYear,
  useAcademicYearsQuery,
  useActivateAcademicYearMutation,
  useArchiveAcademicYearMutation,
  useCreateAcademicYearMutation,
  useUpdateAcademicYearMutation,
} from "../api";

import { TermsPanel } from "./terms-panel";
import { YearFormDialog } from "./year-form-dialog";

interface PendingAction {
  year: AcademicYear;
  kind: "activate" | "archive";
}

export function YearsView(): ReactElement {
  const t = useTranslations("app.academic.years");
  const format = useFormatter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_master_data");
  const [includeArchived, setIncludeArchived] = useRememberedViewState(
    "years-include-archived",
    false,
  );
  const { data, isLoading } = useAcademicYearsQuery({ includeArchived });
  const create = useCreateAcademicYearMutation();
  const update = useUpdateAcademicYearMutation();
  const activate = useActivateAcademicYearMutation();
  const archive = useArchiveAcademicYearMutation();

  const [editing, setEditing] = useState<AcademicYear | "new" | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [managingTerms, setManagingTerms] = useState<AcademicYear | null>(null);

  const rows = data?.data ?? [];

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const columns = useMemo<ColumnDef<AcademicYear>[]>(
    () => [
      {
        accessorKey: "label",
        header: t("columns.label"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            {row.original.label}
            {row.original.is_active && <Badge variant="accent">{t("active")}</Badge>}
            {row.original.archived_at && <Badge variant="neutral">{t("archived")}</Badge>}
          </span>
        ),
      },
      {
        id: "period",
        header: t("columns.period"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-fg-muted">
            {formatCalendarDate(format, row.original.starts_on)} -{" "}
            {formatCalendarDate(format, row.original.ends_on)}
          </span>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const year = row.original;
          return (
            <div className="flex justify-end gap-1">
              <IconButton
                icon={<Rows3 />}
                aria-label={t("manageTerms")}
                onClick={() => {
                  setManagingTerms(year);
                }}
              />
              {canManage && (
                <>
                  <IconButton
                    icon={<Pencil />}
                    aria-label={t("edit")}
                    onClick={() => {
                      setEditing(year);
                    }}
                  />
                  {!year.is_active && !year.archived_at && (
                    <IconButton
                      icon={<CircleCheck />}
                      aria-label={t("activate")}
                      onClick={() => {
                        setPendingAction({ year, kind: "activate" });
                      }}
                    />
                  )}
                  {!year.archived_at && !year.is_active && (
                    <IconButton
                      icon={<Archive />}
                      aria-label={t("archive")}
                      onClick={() => {
                        setPendingAction({ year, kind: "archive" });
                      }}
                    />
                  )}
                </>
              )}
            </div>
          );
        },
      },
    ],
    [t, format, canManage],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setEditing("new");
              }}
            >
              {t("add")}
            </Button>
          )
        }
      />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <label className="flex w-fit items-center gap-2 text-[13px]">
        <Switch checked={includeArchived} onCheckedChange={setIncludeArchived} />
        {t("showArchived")}
      </label>

      <DataTable
        stateKey="features/academic/components/years-view:1"
        mode="local"
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        getRowId={(y) => y.id}
        emptyState={
          <EmptyState
            icon={<CalendarRange aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <YearFormDialog
        target={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        pending={create.isPending || update.isPending}
        onSubmit={(body) => {
          void (async () => {
            try {
              if (editing === "new") await create.mutateAsync(body);
              else if (editing) await update.mutateAsync({ id: editing.id, body });
              toast.success(t("saved"));
              setEditing(null);
            } catch (error) {
              fail(error);
            }
          })();
        }}
      />

      <TermsPanel
        year={managingTerms}
        onOpenChange={(open) => {
          if (!open) setManagingTerms(null);
        }}
      />

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={pendingAction?.kind === "activate" ? t("activateTitle") : t("archiveTitle")}
        description={
          pendingAction
            ? pendingAction.kind === "activate"
              ? t("activateBody", { label: pendingAction.year.label })
              : t("archiveBody", { label: pendingAction.year.label })
            : ""
        }
        confirmLabel={pendingAction?.kind === "activate" ? t("activate") : t("archive")}
        destructive={pendingAction?.kind === "archive"}
        confirming={activate.isPending || archive.isPending}
        onConfirm={async () => {
          if (!pendingAction) return;
          try {
            if (pendingAction.kind === "activate") {
              await activate.mutateAsync(pendingAction.year.id);
              toast.success(t("activated"));
            } else {
              await archive.mutateAsync(pendingAction.year.id);
              toast.success(t("archived"));
            }
          } catch (error) {
            fail(error);
          } finally {
            setPendingAction(null);
          }
        }}
      />
    </div>
  );
}

/** A YYYY-MM-DD calendar date as a short id-ID style date, read at local midnight. */
function formatCalendarDate(format: ReturnType<typeof useFormatter>, value: string): string {
  return format.dateTime(new Date(`${value}T00:00:00`), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
