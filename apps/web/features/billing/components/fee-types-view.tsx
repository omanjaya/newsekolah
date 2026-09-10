"use client";

import { ApiError } from "@newsekolah/api-client";
import { type Locale, formatCurrency } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  Checkbox,
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
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { type FeeType, useDeleteFeeTypeMutation, useFeeTypesQuery } from "../api";

import { FeeTypeDiscountsDialog } from "./fee-type-discounts-dialog";
import { FeeTypeForm } from "./fee-type-form";

export function FeeTypesView(): ReactElement {
  const t = useTranslations("app.billing.feeTypes");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_fee_types");

  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isLoading } = useFeeTypesQuery(includeInactive);
  const remove = useDeleteFeeTypeMutation();

  const [editing, setEditing] = useState<FeeType | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FeeType | null>(null);
  const [discountsFor, setDiscountsFor] = useState<FeeType | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<FeeType>[]>(
    () => [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        id: "amount",
        header: t("columns.amount"),
        enableSorting: false,
        cell: ({ row }) =>
          formatCurrency(row.original.amount_minor, row.original.currency, { locale }),
      },
      {
        id: "recurrence",
        header: t("columns.recurrence"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.recurrence === "monthly" ? t("recurrenceMonthly") : row.original.period,
      },
      {
        accessorKey: "is_active",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "accent" : "neutral"}>
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
                          setDiscountsFor(item);
                        }}
                      >
                        {t("manageDiscounts")}
                      </DropdownMenuItem>
                      {item.is_active && (
                        <DropdownMenuItem
                          onSelect={() => {
                            setPendingDelete(item);
                          }}
                        >
                          {t("deleteConfirm")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              },
            } satisfies ColumnDef<FeeType>,
          ]
        : []),
    ],
    [t, locale, canManage],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox
            checked={includeInactive}
            onCheckedChange={(v) => {
              setIncludeInactive(v === true);
            }}
          />
          {t("includeInactive")}
        </label>
        {canManage && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("add")}
          </Button>
        )}
      </div>

      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.billing aria-hidden="true" />}
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
