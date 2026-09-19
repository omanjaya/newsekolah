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
  IconButton,
  Input,
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
  type LibraryMasterEntry,
  type LibraryMasterEntryWrite,
  useCreateLibraryAcquisitionSourceMutation,
  useDeleteLibraryAcquisitionSourceMutation,
  useLibraryAcquisitionSourcesQuery,
  useUpdateLibraryAcquisitionSourceMutation,
} from "../master-data-api";

/** Acquisition sources (purchase, donation, ...) used on copies to say where a book came from. */
export function AcquisitionSourcesTab(): ReactElement {
  const t = useTranslations("app.library.masterData.acquisitionSources");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_library_catalog");

  const { data, isLoading } = useLibraryAcquisitionSourcesQuery();
  const deleteEntry = useDeleteLibraryAcquisitionSourceMutation();
  const [editing, setEditing] = useState<LibraryMasterEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LibraryMasterEntry | null>(null);

  const items = data?.data ?? [];

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
            <div className="flex gap-2">
              <IconButton
                icon={<Pencil />}
                aria-label={t("edit")}
                onClick={() => {
                  setEditing(row.original);
                }}
              />
              <IconButton
                icon={<Trash2 />}
                aria-label={t("delete")}
                onClick={() => {
                  setDeleting(row.original);
                }}
              />
            </div>
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
          stateKey="features/library/components/acquisition-sources-tab:1"
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
            <AcquisitionSourceForm
              entry={null}
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
            <AcquisitionSourceForm
              entry={editing}
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
        confirming={deleteEntry.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteEntry.mutateAsync(deleting.id);
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

function AcquisitionSourceForm({
  entry,
  onDone,
}: {
  entry: LibraryMasterEntry | null;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.masterData.acquisitionSources.form");
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryAcquisitionSourceMutation();
  const update = useUpdateLibraryAcquisitionSourceMutation();

  const [code, setCode] = useState(entry?.code ?? "");
  const [name, setName] = useState(entry?.name ?? "");
  const [isActive, setIsActive] = useState(entry?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(entry?.sort_order ?? 0));
  const [error, setError] = useState("");

  const mutation = entry ? update : create;

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
        const onError = (err: unknown) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (entry) {
          update.mutate({ id: entry.id, ...body }, { onSuccess: onDone, onError });
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
