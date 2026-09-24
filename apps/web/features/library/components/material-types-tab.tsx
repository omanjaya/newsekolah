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
  Input,
  RowActionsMenu,
  Switch,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type LibraryMaterialType,
  type LibraryMaterialTypeWrite,
  useCreateLibraryMaterialTypeMutation,
  useDeleteLibraryMaterialTypeMutation,
  useLibraryMaterialTypesQuery,
  useUpdateLibraryMaterialTypeMutation,
} from "../master-data-api";

/** Material types (book, magazine, ...), each with its own loan limits used when a title is checked out. */
export function MaterialTypesTab(): ReactElement {
  const t = useTranslations("app.library.masterData.materialTypes");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_catalog");

  const { data, isLoading } = useLibraryMaterialTypesQuery();
  const deleteType = useDeleteLibraryMaterialTypeMutation();
  const [editing, setEditing] = useState<LibraryMaterialType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LibraryMaterialType | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryMaterialType>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code"), enableSorting: false },
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        id: "loanLimit",
        header: t("columns.loanLimit"),
        enableSorting: false,
        cell: ({ row }) =>
          t("loanLimitValue", {
            items: row.original.max_loan_items,
            days: row.original.max_loan_days,
          }),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "accent" : "neutral"}>
            {row.original.is_active ? t("active") : t("inactive")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <RowActionsMenu
              ariaLabel={t("rowActions", { name: row.original.name })}
              items={[
                {
                  label: t("edit"),
                  icon: <Pencil className="size-4" aria-hidden="true" />,
                  onClick: () => {
                    setEditing(row.original);
                  },
                },
                {
                  label: t("delete"),
                  icon: <Trash2 className="size-4" aria-hidden="true" />,
                  tone: "danger",
                  onClick: () => {
                    setDeleting(row.original);
                  },
                },
              ]}
            />
          ) : null,
      },
    ],
    [t, canManage],
  );

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <div className="flex justify-end">
        {canManage && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("add")}
          </Button>
        )}
      </div>

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/library/components/material-types-tab:1"
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
          fillHeight
          emptyState={
            <EmptyState
              icon={<domainIcons.library aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          }
        />
      </div>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
        }}
      >
        <DialogContent title={t("add")}>
          {creating && (
            <MaterialTypeForm
              materialType={null}
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={t("editTitle")}>
          {editing && (
            <MaterialTypeForm
              materialType={editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteTitle")}
        description={deleting ? t("deleteBody", { name: deleting.name }) : ""}
        destructive
        confirming={deleteType.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteType.mutateAsync(deleting.id);
            toast.success(t("deleted"));
            setDeleting(null);
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              toast.error(t("stillInUse"));
              return;
            }
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
    </div>
  );
}

function MaterialTypeForm({
  materialType,
  onDone,
}: {
  materialType: LibraryMaterialType | null;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.masterData.materialTypes.form");
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryMaterialTypeMutation();
  const update = useUpdateLibraryMaterialTypeMutation();

  const [code, setCode] = useState(materialType?.code ?? "");
  const [name, setName] = useState(materialType?.name ?? "");
  const [maxLoanItems, setMaxLoanItems] = useState(String(materialType?.max_loan_items ?? 3));
  const [maxLoanDays, setMaxLoanDays] = useState(String(materialType?.max_loan_days ?? 7));
  const [maxRenewals, setMaxRenewals] = useState(String(materialType?.max_renewals ?? 1));
  const [isActive, setIsActive] = useState(materialType?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(materialType?.sort_order ?? 0));
  const [error, setError] = useState("");

  const mutation = materialType ? update : create;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const body: LibraryMaterialTypeWrite = {
          code: code.trim(),
          name: name.trim(),
          max_loan_items: Number(maxLoanItems) || 1,
          max_loan_days: Number(maxLoanDays) || 1,
          max_renewals: Number(maxRenewals) || 0,
          is_active: isActive,
          sort_order: Number(sortOrder) || 0,
        };
        const onError = (err: unknown) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (materialType) {
          update.mutate({ id: materialType.id, ...body }, { onSuccess: onDone, onError });
        } else {
          create.mutate(body, { onSuccess: onDone, onError });
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("code")}</span>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          required
          maxLength={20}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={100}
        />
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("maxLoanItems")}</span>
          <Input
            type="number"
            min={1}
            value={maxLoanItems}
            onChange={(e) => {
              setMaxLoanItems(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("maxLoanDays")}</span>
          <Input
            type="number"
            min={1}
            value={maxLoanDays}
            onChange={(e) => {
              setMaxLoanDays(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("maxRenewals")}</span>
          <Input
            type="number"
            min={0}
            value={maxRenewals}
            onChange={(e) => {
              setMaxRenewals(e.target.value);
            }}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("sortOrder")}</span>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => {
            setSortOrder(e.target.value);
          }}
        />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <span className="font-medium">{t("isActive")}</span>
      </label>
      {error && <p className="text-[13px] text-status-absent">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={!code.trim() || !name.trim()}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
