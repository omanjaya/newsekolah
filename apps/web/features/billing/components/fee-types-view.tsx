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
  FirstUseEmptyState,
  RowActionsMenu,
  domainIcons,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Pencil, Percent, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { type FeeType, useDeleteFeeTypeMutation, useFeeTypesQuery } from "../api";
import { useBillingFormat } from "../lib/use-billing-format";

import { FeeTypeDiscountsDialog } from "./fee-type-discounts-dialog";
import { FeeTypeForm } from "./fee-type-form";

/**
 * The fees the school charges (monthly SPP, one-off fees), each with its
 * amount and status, and per-student discounts reached from the row menu.
 * Retiring a fee keeps the bills already issued from it.
 */
export function FeeTypesView(): ReactElement {
  const t = useTranslations("app.billing.feeTypes");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_fee_types");
  const { money } = useBillingFormat();

  const [includeInactiveParam, setIncludeInactiveParam] = useUrlState<"" | "true">(
    "include_inactive",
    ["", "true"],
    "",
  );
  const includeInactive = includeInactiveParam === "true";
  const { data, isLoading, isError, error, refetch, isRefetching } =
    useFeeTypesQuery(includeInactive);
  const remove = useDeleteFeeTypeMutation();

  const [editing, setEditing] = useState<FeeType | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FeeType | null>(null);
  const [discountsFor, setDiscountsFor] = useState<FeeType | null>(null);

  const items = data?.data ?? [];
  const startCreate = () => {
    setEditing("new");
  };

  const filters: DataTableFilterDef[] = [
    {
      id: "includeInactive",
      label: t("includeInactive"),
      value: includeInactiveParam,
      onChange: (value) => {
        setIncludeInactiveParam(value as "" | "true");
      },
      type: "boolean",
      activeValue: "true",
    },
  ];

  const columns = useMemo<ColumnDef<FeeType>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
      },
      {
        id: "recurrence",
        header: t("columns.recurrence"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) =>
          row.original.recurrence === "monthly" ? t("recurrenceMonthly") : row.original.period,
      },
      {
        id: "amount",
        header: t("columns.amount"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {money(row.original.amount_minor, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "is_active",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge tone={row.original.is_active ? "success" : "neutral"} dot>
            {t(row.original.is_active ? "status.active" : "status.inactive")}
          </Badge>
        ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: t("columns.actions"),
              enableSorting: false,
              cell: ({ row }: { row: { original: FeeType } }) => {
                const item = row.original;
                return (
                  <RowActionsMenu
                    ariaLabel={t("rowActions", { name: item.name })}
                    items={[
                      {
                        label: t("edit"),
                        icon: <Pencil />,
                        onClick: () => {
                          setEditing(item);
                        },
                      },
                      {
                        label: t("manageDiscounts"),
                        icon: <Percent />,
                        onClick: () => {
                          setDiscountsFor(item);
                        },
                      },
                      ...(item.is_active
                        ? [
                            {
                              label: t("deleteConfirm"),
                              icon: <Ban />,
                              tone: "danger" as const,
                              onClick: () => {
                                setPendingDelete(item);
                              },
                            },
                          ]
                        : []),
                    ]}
                  />
                );
              },
            } satisfies ColumnDef<FeeType>,
          ]
        : []),
    ],
    [t, money, canManage],
  );

  const empty = {
    icon: <domainIcons.billing />,
    title: t("emptyTitle"),
    description: t("emptyBody"),
  };

  return (
    <div className="flex flex-col md:min-h-0 md:flex-1">
      <DataTable
        stateKey="features/billing/components/fee-types-view:1"
        mode="local"
        data={items}
        columns={columns}
        rowCount={items.length}
        searchable={false}
        filters={filters}
        filtersLabels={{
          reset: t("filters.reset"),
          removeFilter: (label) => t("filters.removeFilter", { label }),
        }}
        toolbarActions={
          canManage ? (
            <Button icon={<Plus />} onClick={startCreate}>
              {t("add")}
            </Button>
          ) : undefined
        }
        isLoading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(item) => item.id}
        fillHeight
        emptyState={
          canManage ? (
            <FirstUseEmptyState {...empty} actionLabel={t("add")} onAction={startCreate} />
          ) : (
            <EmptyState {...empty} />
          )
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
            <FeeTypeForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <FeeTypeDiscountsDialog
        feeType={discountsFor}
        onOpenChange={(open) => {
          if (!open) setDiscountsFor(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={pendingDelete ? t("deleteBody", { name: pendingDelete.name }) : ""}
        confirmLabel={t("deleteConfirm")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
          } catch (deleteError) {
            toast.error(
              deleteError instanceof ApiError
                ? apiErrorMessage(deleteError.code)
                : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
