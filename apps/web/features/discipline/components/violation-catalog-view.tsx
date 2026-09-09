"use client";

import { ApiError } from "@newsekolah/api-client";
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
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type ViolationType, useDeleteViolationTypeMutation, useViolationTypesQuery } from "../api";

import { ViolationTypeForm } from "./violation-type-form";

export function ViolationCatalogView(): ReactElement {
  const t = useTranslations("app.discipline.catalog");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isLoading } = useViolationTypesQuery(includeInactive);
  const remove = useDeleteViolationTypeMutation();

  const [editing, setEditing] = useState<ViolationType | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ViolationType | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<ViolationType>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code"), enableSorting: false },
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      { accessorKey: "points", header: t("columns.points"), enableSorting: false },
      {
        accessorKey: "category",
        header: t("columns.category"),
        enableSorting: false,
        cell: ({ row }) => row.original.category || "-",
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
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
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
      },
    ],
    [t],
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
            icon={<domainIcons.violation aria-hidden="true" />}
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
            <ViolationTypeForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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
