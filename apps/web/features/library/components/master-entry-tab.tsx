"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  FormError,
  DialogFooter,
  NumberInput,
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
import type { UseMutationResult } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import type { LibraryMasterEntry, LibraryMasterEntryWrite } from "../master-data-api";
import { useLibraryErrorMessage } from "../use-library-error-message";

import { MasterListHeader } from "./master-list-header";

/**
 * The i18n namespaces of the simple code/name master lists. They all share
 * one key shape (add, columns.*, form.*, stillInUse, ...), which is what
 * lets one component serve them.
 */
export type MasterEntryNamespace =
  | "app.library.masterData.acquisitionSources"
  | "app.library.masterData.collectionCategories"
  | "app.library.masterData.locations";

/** Each list's tab key, whose label also heads the list. */
const LIST_KEY = {
  "app.library.masterData.acquisitionSources": "acquisitionSources",
  "app.library.masterData.collectionCategories": "collectionCategories",
  "app.library.masterData.locations": "locations",
} as const satisfies Record<MasterEntryNamespace, string>;

export interface MasterEntryTabProps {
  namespace: MasterEntryNamespace;
  stateKey: string;
  items: LibraryMasterEntry[];
  isLoading: boolean;
  /** The list query's error: shown in place of the rows, with a retry. */
  error?: unknown;
  onRetry?: () => void;
  create: UseMutationResult<unknown, Error, LibraryMasterEntryWrite>;
  update: UseMutationResult<unknown, Error, LibraryMasterEntryWrite & { id: string }>;
  remove: UseMutationResult<unknown, Error, string>;
}

/**
 * A code/name/sort-order/active master list with create, edit, and delete
 * (the API refuses delete with 409 while a copy still references the entry).
 */
export function MasterEntryTab({
  namespace,
  stateKey,
  items,
  isLoading,
  error,
  onRetry,
  create,
  update,
  remove,
}: MasterEntryTabProps): ReactElement {
  const t = useTranslations(namespace);
  const tMasterData = useTranslations("app.library.masterData");
  const toast = useToast();
  const libraryErrorMessage = useLibraryErrorMessage();
  const canManage = useCan("manage_library_catalog");

  const [editing, setEditing] = useState<LibraryMasterEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LibraryMasterEntry | null>(null);

  const columns = useMemo<ColumnDef<LibraryMasterEntry>[]>(
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

  const formOpen = creating || editing !== null;
  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

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
        title={tMasterData(`tabs.${LIST_KEY[namespace]}`)}
        count={items.length}
        addLabel={t("add")}
        showAdd={canManage && (isLoading || items.length > 0)}
        onAdd={() => {
          setCreating(true);
        }}
      />
      <DataTable
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        stateKey={stateKey}
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
        onRetry={onRetry}
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
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent title={editing ? t("editTitle") : t("add")}>
          {formOpen && (
            <MasterEntryForm
              key={editing?.id ?? "new"}
              namespace={namespace}
              entry={editing}
              create={create}
              update={update}
              onDone={closeForm}
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
        confirmLabel={t("delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(t("deleted"));
            setDeleting(null);
          } catch (error) {
            toast.error(
              error instanceof ApiError && error.code === "LIBRARY_MASTER_DATA_IN_USE"
                ? t("stillInUse")
                : libraryErrorMessage(error),
            );
            setDeleting(null);
          }
        }}
      />
    </div>
  );
}

function MasterEntryForm({
  namespace,
  entry,
  create,
  update,
  onDone,
}: {
  namespace: MasterEntryNamespace;
  entry: LibraryMasterEntry | null;
  create: MasterEntryTabProps["create"];
  update: MasterEntryTabProps["update"];
  onDone: () => void;
}): ReactElement {
  const t = useTranslations(namespace);
  const toast = useToast();
  const libraryErrorMessage = useLibraryErrorMessage();

  const [code, setCode] = useState(entry?.code ?? "");
  const [name, setName] = useState(entry?.name ?? "");
  const [isActive, setIsActive] = useState(entry?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(entry?.sort_order ?? 0));
  const [error, setError] = useState("");
  const { ref: formRef, attempted, check } = useSubmitValidation();
  const tValidation = useTranslations("validation");
  const requiredError = (value: string) =>
    attempted && !value.trim() ? tValidation("required") : undefined;

  const pending = entry ? update.isPending : create.isPending;

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (!check(Boolean(code.trim() && name.trim()))) return;
        const body: LibraryMasterEntryWrite = {
          code: code.trim(),
          name: name.trim(),
          is_active: isActive,
          sort_order: Number(sortOrder) || 0,
        };
        const onSuccess = () => {
          toast.success(t("saved"));
          onDone();
        };
        const onError = (err: unknown) => {
          setError(libraryErrorMessage(err));
        };
        if (entry) {
          update.mutate({ id: entry.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
      }}
    >
      <Field label={t("form.code")} required error={requiredError(code)}>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          maxLength={20}
        />
      </Field>
      <Field label={t("form.name")} required error={requiredError(name)}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          maxLength={100}
        />
      </Field>
      <Field label={t("form.sortOrder")}>
        <NumberInput
          inputMode="numeric"
          value={sortOrder === "" ? null : Number(sortOrder)}
          onChange={(next) => {
            setSortOrder(next === null ? "" : String(next));
          }}
        />
      </Field>
      <Field label={t("form.isActive")} orientation="horizontal">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </Field>
      {error && <FormError>{error}</FormError>}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("form.cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("form.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
