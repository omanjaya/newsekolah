"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import {
  type Room,
  useCreateRoomMutation,
  useDeleteRoomMutation,
  useRoomsQuery,
  useUpdateRoomMutation,
} from "../api-master-data";

export function RoomsView(): ReactElement {
  const t = useTranslations("app.academic.rooms");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_master_data");
  const [search, setSearch] = useRememberedViewState("rooms-search", "");
  const { data, isLoading } = useRoomsQuery(search);
  const create = useCreateRoomMutation();
  const update = useUpdateRoomMutation();
  const remove = useDeleteRoomMutation();

  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Room | null>(null);

  const rows = data?.data ?? [];

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function open(target: Room | "new") {
    setEditing(target);
    setCode(target === "new" ? "" : target.code);
    setName(target === "new" ? "" : target.name);
    setCapacity(target === "new" || target.capacity === undefined ? "" : String(target.capacity));
  }

  async function save() {
    if (!code.trim() || !name.trim()) return;
    const body = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      ...(capacity.trim() ? { capacity: Number.parseInt(capacity, 10) } : {}),
    };
    try {
      if (editing === "new") await create.mutateAsync(body);
      else if (editing) await update.mutateAsync({ id: editing.id, body });
      toast.success(t("saved"));
      setEditing(null);
    } catch (error) {
      fail(error);
    }
  }

  const columns = useMemo<ColumnDef<Room>[]>(
    () => [
      // Name leads because the phone card uses the first column as its title.
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      { accessorKey: "code", header: t("columns.code"), enableSorting: false },
      {
        accessorKey: "capacity",
        header: t("columns.capacity"),
        enableSorting: false,
        cell: ({ row }) => row.original.capacity ?? "-",
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end gap-1">
              <IconButton
                icon={<Pencil />}
                aria-label={t("edit")}
                onClick={() => {
                  open(row.original);
                }}
              />
              <IconButton
                icon={<Trash2 />}
                aria-label={t("delete")}
                onClick={() => {
                  setPendingDelete(row.original);
                }}
              />
            </div>
          ) : null,
      },
    ],
    [t, canManage],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-medium text-fg">{t("title")}</h2>
        {canManage && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              open("new");
            }}
          >
            {t("add")}
          </Button>
        )}
      </div>
      <DataTable
        stateKey="features/academic/components/rooms-view:1"
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        isLoading={isLoading}
        getRowId={(r) => r.id}
        emptyState={
          <EmptyState
            icon={<DoorOpen aria-hidden="true" />}
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
        <DialogContent title={editing === "new" ? t("add") : t("edit")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("columns.code")}</span>
              <Input
                value={code}
                maxLength={16}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("columns.name")}</span>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("columns.capacity")}</span>
              <Input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => {
                  setCapacity(e.target.value);
                }}
                className="w-32"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {t("save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={pendingDelete ? t("deleteBody", { name: pendingDelete.name }) : ""}
        confirmLabel={t("delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
          } catch (error) {
            fail(error);
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
