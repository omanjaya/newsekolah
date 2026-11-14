"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  IconButton,
  Input,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Compass, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import {
  type Track,
  useCreateTrackMutation,
  useDeleteTrackMutation,
  useTracksQuery,
  useUpdateTrackMutation,
} from "../api-master-data";

/** Tracks (peminatan): IPA/IPS/Bahasa in SMA, or program majors in SMK. */
export function TracksView(): ReactElement {
  const t = useTranslations("app.academic.tracks");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_master_data");
  const { data, isLoading, error, refetch, isRefetching } = useTracksQuery();
  const create = useCreateTrackMutation();
  const update = useUpdateTrackMutation();
  const remove = useDeleteTrackMutation();

  const [editing, setEditing] = useState<Track | "new" | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Track | null>(null);
  const [filter, setFilter] = useRememberedViewState("tracks-filter", "");

  const rows = useMemo(() => {
    const all = data?.data ?? [];
    const q = filter.toLowerCase();
    return q
      ? all.filter((x) => x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q))
      : all;
  }, [data, filter]);

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function open(target: Track | "new") {
    setEditing(target);
    setCode(target === "new" ? "" : target.code);
    setName(target === "new" ? "" : target.name);
  }

  async function save() {
    if (!code.trim() || !name.trim()) return;
    const body = { code: code.trim().toUpperCase(), name: name.trim() };
    try {
      if (editing === "new") await create.mutateAsync(body);
      else if (editing) await update.mutateAsync({ id: editing.id, body });
      toast.success(t("saved"));
      setEditing(null);
    } catch (error) {
      fail(error);
    }
  }

  const columns = useMemo<ColumnDef<Track>[]>(
    () => [
      // Name leads because the phone card uses the first column as its title.
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
      <p className="text-body-sm text-fg-muted">{t("description")}</p>
      <DataTable
        toolbarActions={
          canManage ? (
            <Button
              icon={<Plus />}
              onClick={() => {
                open("new");
              }}
            >
              {t("add")}
            </Button>
          ) : undefined
        }
        stateKey="features/academic/components/tracks-view:1"
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={filter}
        onGlobalFilterChange={setFilter}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(x) => x.id}
        emptyState={
          <EmptyState
            icon={<Compass aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              canManage ? (
                <Button
                  icon={<Plus />}
                  onClick={() => {
                    open("new");
                  }}
                >
                  {t("add")}
                </Button>
              ) : undefined
            }
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
            <Field label={t("columns.code")}>
              <Input
                value={code}
                maxLength={16}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
                required
              />
            </Field>
            <Field label={t("columns.name")}>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                required
              />
            </Field>
            <DialogFooter>
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
            </DialogFooter>
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
