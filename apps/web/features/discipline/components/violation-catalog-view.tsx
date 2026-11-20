"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
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
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type ViolationType, useUpdateViolationTypeMutation, useViolationTypesQuery } from "../api";

import { ViolationTypeForm } from "./violation-type-form";

export function ViolationCatalogView(): ReactElement {
  const t = useTranslations("app.discipline.catalog");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [includeInactiveParam, setIncludeInactiveParam] = useUrlState<"" | "true">(
    "include_inactive",
    ["", "true"],
    "",
  );
  const includeInactive = includeInactiveParam === "true";
  const { data, isLoading, error, refetch } = useViolationTypesQuery(includeInactive);
  const { mutateAsync: updateType } = useUpdateViolationTypeMutation();

  const [editing, setEditing] = useState<ViolationType | "new" | null>(null);

  const items = data?.data ?? [];

  // "Nonaktifkan" only switches a type off: it stays listed under
  // "Tampilkan yang nonaktif" and "Aktifkan" switches it back on. Being
  // reversible, it runs at once and offers an undo instead of a confirm
  // dialog (docs/07-ui-ux.md section 5).
  const setActive = useCallback(
    (item: ViolationType, isActive: boolean) => {
      const change = async (active: boolean, offerUndo: boolean): Promise<void> => {
        try {
          await updateType({
            id: item.id,
            code: item.code,
            name: item.name,
            points: item.points,
            category: item.category,
            is_active: active,
          });
          toast.success(
            t(active ? "activated" : "deactivated", { name: item.name }),
            offerUndo
              ? {
                  action: {
                    label: t("undo"),
                    onClick: () => {
                      void change(!active, false);
                    },
                  },
                }
              : undefined,
          );
        } catch (error) {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        }
      };
      void change(isActive, true);
    },
    [updateType, toast, t, apiErrorMessage],
  );

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
                <DropdownMenuItem
                  onSelect={() => {
                    setActive(item, !item.is_active);
                  }}
                >
                  {t(item.is_active ? "deactivate" : "activate")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [t, setActive],
  );

  // It opens in a sheet over the Pelanggaran page (violations-view.tsx),
  // whose body scrolls, so the table takes its natural height.
  return (
    <>
      <DataTable
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        stateKey="features/discipline/components/violation-catalog-view:1"
        mode="local"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        filters={filters}
        toolbarActions={
          <Button
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("add")}
          </Button>
        }
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
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
    </>
  );
}
