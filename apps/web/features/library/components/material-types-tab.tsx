"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  DialogFooter,
  NumberInput,
  FormError,
  Field,
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
  useSubmitValidation,
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

import { MasterListHeader } from "./master-list-header";

/** Material types (book, magazine, ...), each with its own loan limits used when a title is checked out. */
export function MaterialTypesTab(): ReactElement {
  const t = useTranslations("app.library.masterData.materialTypes");
  const tMasterData = useTranslations("app.library.masterData");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_catalog");

  const { data, isLoading, error, refetch } = useLibraryMaterialTypesQuery();
  const deleteType = useDeleteLibraryMaterialTypeMutation();
  const [editing, setEditing] = useState<LibraryMaterialType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LibraryMaterialType | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryMaterialType>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
      },
      {
        accessorKey: "code",
        header: t("columns.code"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.code}</span>,
      },
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

  const addButton = canManage ? (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t("add")}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <MasterListHeader
        title={tMasterData("tabs.materialTypes")}
        count={items.length}
        addLabel={t("add")}
        showAdd={canManage && (isLoading || items.length > 0)}
        onAdd={() => {
          setCreating(true);
        }}
      />
      <DataTable
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
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
        error={error}
        onRetry={() => void refetch()}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={addButton}
          />
        }
      />

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
  const { ref: formRef, attempted, check } = useSubmitValidation();
  const tValidation = useTranslations("validation");
  const requiredError = (value: string) =>
    attempted && !value.trim() ? tValidation("required") : undefined;

  const mutation = materialType ? update : create;

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (!check(Boolean(code.trim() && name.trim()))) return;
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
      <Field label={t("code")} required error={requiredError(code)}>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          maxLength={20}
        />
      </Field>
      <Field label={t("name")} required error={requiredError(name)}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          maxLength={100}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label={t("maxLoanItems")}>
          <NumberInput
            min={1}
            value={maxLoanItems === "" ? null : Number(maxLoanItems)}
            onChange={(next) => {
              setMaxLoanItems(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("maxLoanDays")}>
          <NumberInput
            min={1}
            value={maxLoanDays === "" ? null : Number(maxLoanDays)}
            onChange={(next) => {
              setMaxLoanDays(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("maxRenewals")}>
          <NumberInput
            min={0}
            value={maxRenewals === "" ? null : Number(maxRenewals)}
            onChange={(next) => {
              setMaxRenewals(next === null ? "" : String(next));
            }}
          />
        </Field>
      </div>
      <Field label={t("sortOrder")}>
        <NumberInput
          value={sortOrder === "" ? null : Number(sortOrder)}
          onChange={(next) => {
            setSortOrder(next === null ? "" : String(next));
          }}
        />
      </Field>
      <Field label={t("isActive")} orientation="horizontal">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </Field>
      {error && <FormError>{error}</FormError>}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
