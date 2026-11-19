"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  RowActionsMenu,
  SectionHeader,
  domainIcons,
  useToast,
  type DataTableProps,
} from "@newsekolah/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { clockRange } from "../../schedule/clock-label";
import {
  type Period,
  useCreatePeriodMutation,
  useDeletePeriodMutation,
  useTemplatePeriodsQuery,
  useUpdatePeriodMutation,
} from "../api";

import { PeriodForm } from "./period-form";

/**
 * The periods of one template as a table, with add, edit and a confirmed
 * delete. "Tambah jam" sits on the section's title line, and each row's
 * edit and delete wait behind one labelled menu, as on the other school
 * tables.
 */
export function PeriodTable({ templateId }: { templateId: string }): ReactElement {
  const t = useTranslations("app.school.periods");
  // The row menu is named as the user list names its own ("Aksi untuk Jam 1").
  const tRow = useTranslations("app.school.users.actions");
  const locale = useLocale();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const periods = useTemplatePeriodsQuery(templateId);
  const create = useCreatePeriodMutation(templateId);
  const update = useUpdatePeriodMutation();
  const remove = useDeletePeriodMutation();
  const [editing, setEditing] = useState<Period | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Period | null>(null);
  const rows = useMemo(
    () => [...(periods.data?.data ?? [])].sort((a, b) => a.sequence - b.sequence),
    [periods.data],
  );
  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const columns = useMemo<DataTableProps<Period>["columns"]>(
    () => [
      {
        accessorKey: "sequence",
        header: "#",
        enableSorting: false,
        meta: { card: "hidden", align: "end", label: t("sequence") },
        cell: ({ row }) => (
          <span className="text-fg-muted tabular-nums">{row.original.sequence}</span>
        ),
      },
      {
        accessorKey: "name",
        header: t("name"),
        enableSorting: false,
        meta: { card: "title" },
      },
      {
        id: "time",
        header: t("time"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {clockRange(row.original.starts_at, row.original.ends_at, locale)}
          </span>
        ),
      },
      {
        id: "kind",
        header: t("kind"),
        enableSorting: false,
        meta: { card: "meta" },
        cell: ({ row }) =>
          row.original.is_break ? (
            <Badge tone="neutral">{t("break")}</Badge>
          ) : (
            <span className="text-fg-muted">{t("lesson")}</span>
          ),
      },
      {
        id: "actions",
        header: t("actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionsMenu
            ariaLabel={tRow("menuFor", { name: row.original.name })}
            items={[
              {
                label: t("edit"),
                icon: <Pencil />,
                onClick: () => {
                  setEditing(row.original);
                },
              },
              {
                label: t("delete"),
                icon: <Trash2 />,
                tone: "danger",
                onClick: () => {
                  setPendingDelete(row.original);
                },
              },
            ]}
          />
        ),
      },
    ],
    [t, tRow, locale],
  );

  return (
    <section className="flex flex-col gap-3" aria-labelledby="periods-title">
      <SectionHeader
        titleId="periods-title"
        title={t("periodsTitle")}
        count={rows.length}
        action={
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("addPeriod")}
          </Button>
        }
      />
      <DataTable
        mode="local"
        stateKey="features/school/components/periods-view:periods"
        data={rows}
        columns={columns}
        searchable={false}
        isLoading={periods.isLoading}
        error={periods.error}
        onRetry={() => void periods.refetch()}
        getRowId={(period) => period.id}
        emptyState={
          <EmptyState icon={<domainIcons.schedule aria-hidden="true" />} title={t("noPeriods")} />
        }
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deletePeriodTitle")}
        description={pendingDelete ? t("deletePeriodBody", { name: pendingDelete.name }) : ""}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove.mutate(pendingDelete.id, {
            onSuccess: () => {
              setPendingDelete(null);
              toast.success(t("periodDeleted"));
            },
            onError: (error) => {
              setPendingDelete(null);
              fail(error);
            },
          });
        }}
      />
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("addPeriod") : t("edit")}>
          {editing !== null && (
            <PeriodForm
              initial={editing === "new" ? undefined : editing}
              nextSequence={(rows[rows.length - 1]?.sequence ?? 0) + 1}
              lastEnd={rows[rows.length - 1]?.ends_at.slice(0, 5) ?? "07:00"}
              pending={create.isPending || update.isPending}
              onSubmit={async (body) => {
                try {
                  if (editing === "new") await create.mutateAsync(body);
                  else await update.mutateAsync({ id: editing.id, body });
                  toast.success(t("saved"));
                  setEditing(null);
                } catch (error) {
                  fail(error);
                }
              }}
              onCancel={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
