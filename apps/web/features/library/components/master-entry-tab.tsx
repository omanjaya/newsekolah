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
import type { UseMutationResult } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useCan } from "../../../lib/session/session-provider";
import type { LibraryMasterEntry, LibraryMasterEntryWrite } from "../master-data-api";
import { useLibraryErrorMessage } from "../use-library-error-message";

/**
 * The i18n namespaces of the simple code/name master lists. They all share
 * one key shape (add, columns.*, form.*, stillInUse, ...), which is what
 * lets one component serve them.
 */
export type MasterEntryNamespace =
  | "app.library.masterData.acquisitionSources"
  | "app.library.masterData.collectionCategories"
  | "app.library.masterData.locations";

export interface MasterEntryTabProps {
  namespace: MasterEntryNamespace;
  stateKey: string;
  items: LibraryMasterEntry[];
  isLoading: boolean;
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
  create,
  update,
  remove,
}: MasterEntryTabProps): ReactElement {
  const t = useTranslations(namespace);
  const toast = useToast();
  const libraryErrorMessage = useLibraryErrorMessage();
  const canManage = useCan("manage_library_catalog");

  const [editing, setEditing] = useState<LibraryMasterEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LibraryMasterEntry | null>(null);

  const columns = useMemo<ColumnDef<LibraryMasterEntry>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code"), enableSorting: false },
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
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

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      {canManage && (
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t("add")}
          </Button>
        </div>
      )}

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
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

  const pending = entry ? update.isPending : create.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("form.code")}</span>
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
        <span className="font-medium">{t("form.name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={100}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("form.sortOrder")}</span>
        <Input
          type="number"
          inputMode="numeric"
          value={sortOrder}
          onChange={(e) => {
            setSortOrder(e.target.value);
          }}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-[13px]">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <span className="font-medium">{t("form.isActive")}</span>
      </label>
      {error && (
        <p role="alert" className="text-[13px] text-status-absent">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("form.cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={!code.trim() || !name.trim()}>
          {t("form.save")}
        </Button>
      </div>
    </form>
  );
}
