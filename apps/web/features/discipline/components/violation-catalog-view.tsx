"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
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

/** The outcome of the last status change, shown above the table. */
interface StatusNotice {
  tone: "success" | "danger";
  message: string;
  /** Switches the type back, for the change the user just made. */
  undo?: () => void;
}

export function ViolationCatalogView(): ReactElement {
  const t = useTranslations("app.discipline.catalog");
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

  const [notice, setNotice] = useState<StatusNotice | null>(null);

  // "Nonaktifkan" only switches a type off: it stays listed under
  // "Tampilkan yang nonaktif" and "Aktifkan" switches it back on. Being
  // reversible, it runs at once and offers an undo instead of a confirm
  // dialog (docs/07-ui-ux.md section 5). The catalog opens in a modal
  // sheet, whose focus trap keeps the keyboard out of the app's toaster and
  // hides it from screen readers, so the outcome and its undo sit inside
  // the sheet, above the table, in a live region.
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
          setNotice({
            tone: "success",
            message: t(active ? "activated" : "deactivated", { name: item.name }),
            undo: offerUndo
              ? () => {
                  void change(!active, false);
                }
              : undefined,
          });
        } catch (error) {
          setNotice({
            tone: "danger",
            message:
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          });
        }
      };
      void change(isActive, true);
    },
    [updateType, t, apiErrorMessage],
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
      <div aria-live="polite" className="empty:hidden">
        {notice && (
          <Alert
            tone={notice.tone}
            className="mb-3"
            action={
              notice.undo && (
                <Button size="sm" variant="secondary" onClick={notice.undo}>
                  {t("undo")}
                </Button>
              )
            }
            onDismiss={() => {
              setNotice(null);
            }}
          >
            {notice.message}
          </Alert>
        )}
      </div>
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
