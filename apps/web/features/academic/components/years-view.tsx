"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  RowActionsMenu,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, CalendarRange, CircleCheck, ListTree, Pencil, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type AcademicYear,
  useAcademicYearsQuery,
  useActivateAcademicYearMutation,
  useArchiveAcademicYearMutation,
  useCreateAcademicYearMutation,
  useUpdateAcademicYearMutation,
} from "../api";
import { formatCalendarDate } from "../lib/format-calendar-date";

import { AcademicWorkspaceLinks } from "./academic-workspace-links";
import { TermsPanel } from "./terms-panel";
import { YearFormDialog } from "./year-form-dialog";

interface PendingAction {
  year: AcademicYear;
  kind: "activate" | "archive";
}

const ARCHIVED_VALUES = ["", "true"] as const;

export function YearsView(): ReactElement {
  const tWorkspace = useTranslations("app.academic.workspace");
  const t = useTranslations("app.academic.years");
  const format = useFormatter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_master_data");
  const [includeArchivedParam, setIncludeArchivedParam] = useUrlState<
    (typeof ARCHIVED_VALUES)[number]
  >("include_archived", ARCHIVED_VALUES, "");
  const includeArchived = includeArchivedParam === "true";
  const { data, isLoading, error, refetch, isRefetching } = useAcademicYearsQuery({
    includeArchived,
  });
  const create = useCreateAcademicYearMutation();
  const update = useUpdateAcademicYearMutation();
  const activate = useActivateAcademicYearMutation();
  const archive = useArchiveAcademicYearMutation();

  const [editing, setEditing] = useState<AcademicYear | "new" | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [managingTerms, setManagingTerms] = useState<AcademicYear | null>(null);

  const rows = data?.data ?? [];

  // Archived years only matter to whoever can restore or reuse them.
  const filters: DataTableFilterDef[] = canManage
    ? [
        {
          id: "includeArchived",
          label: t("showArchived"),
          value: includeArchivedParam,
          onChange: (value) => {
            setIncludeArchivedParam(value as (typeof ARCHIVED_VALUES)[number]);
          },
          type: "boolean",
          activeValue: "true",
        },
      ]
    : [];

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
        meta: { card: "title" },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">{row.original.label}</span>
            {row.original.is_active && (
              <Badge tone="success" dot>
                {t("active")}
              </Badge>
            )}
            {row.original.archived_at && <Badge tone="neutral">{t("archived")}</Badge>}
          </span>
        ),
      },
      {
        id: "period",
        header: t("columns.period"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => (
          <span className="text-fg-muted tabular-nums">
            {formatCalendarDate(format, row.original.starts_on)} -{" "}
            {formatCalendarDate(format, row.original.ends_on)}
          </span>
        ),
      },
      {
        id: "terms",
        header: t("columns.terms"),
        enableSorting: false,
        meta: { card: "meta", label: t("columns.terms") },
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            icon={<ListTree />}
            onClick={() => {
              setManagingTerms(row.original);
            }}
          >
            {t("manageTerms")}
          </Button>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const year = row.original;
          if (!canManage) return null;
          const canActivate = !year.is_active && !year.archived_at;
          return (
            <div className="flex items-center justify-end gap-1">
              {canActivate && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CircleCheck />}
                  onClick={() => {
                    setPendingAction({ year, kind: "activate" });
                  }}
                >
                  {t("activate")}
                </Button>
              )}
              <RowActionsMenu
                ariaLabel={t("rowActions", { label: year.label })}
                items={[
                  {
                    label: t("edit"),
                    icon: <Pencil />,
                    onClick: () => {
                      setEditing(year);
                    },
                  },
                  ...(canActivate
                    ? [
                        {
                          label: t("archive"),
                          icon: <Archive />,
                          tone: "danger" as const,
                          onClick: () => {
                            setPendingAction({ year, kind: "archive" });
                          },
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          );
        },
      },
    ],
    [t, format, canManage],
  );

  return (
    // The area's header (Tahun ajaran) with no description, as on its
    // sibling tabs, so the tab strip stays put between them.
    <AppPage
      nav={<AcademicWorkspaceLinks area="years" />}
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("add")}
          </Button>
        ) : undefined
      }
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("add"),
              onSelect: () => {
                setEditing("new");
              },
            }
          : undefined
      }
    >
      {canManage && (
        <p className="max-w-prose text-body-sm text-fg-muted">{tWorkspace("yearHelp")}</p>
      )}
      <DataTable
        stateKey="features/academic/components/years-view:1"
        mode="local"
        data={rows}
        columns={columns}
        searchable={false}
        filters={filters}
        filtersLabels={{
          reset: t("filters.reset"),
          removeFilter: (label) => t("filters.removeFilter", { label }),
        }}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(y) => y.id}
        emptyState={
          <EmptyState
            icon={<CalendarRange aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              canManage ? (
                <Button
                  icon={<Plus />}
                  onClick={() => {
                    setEditing("new");
                  }}
                >
                  {t("add")}
                </Button>
              ) : undefined
            }
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
        tone={pendingAction?.kind === "archive" ? "danger" : "default"}
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
    </AppPage>
  );
}
