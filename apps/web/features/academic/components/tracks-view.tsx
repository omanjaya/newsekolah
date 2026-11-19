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
  Input,
  RowActionsMenu,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Compass, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
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

import type { HubPageProps } from "./hub-page";

/** Tracks (peminatan): IPA/IPS/Bahasa in SMA, or program majors in SMK. */
export function TracksView({ page }: { page: HubPageProps }): ReactElement {
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
  const [submitted, setSubmitted] = useState(false);
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
    setSubmitted(false);
  }

  async function save() {
    setSubmitted(true);
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
            <RowActionsMenu
              ariaLabel={t("rowActions", { name: row.original.name })}
              items={[
                {
                  label: t("edit"),
                  icon: <Pencil />,
                  onClick: () => {
                    open(row.original);
                  },
                },
                {
                  label: t("delete"),
                  icon: <Trash2 />,
                  tone: "danger",
                  onClick: () => {
                    setPendingDelete(row.original);
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
    <AppPage
      {...page}
      primaryAction={
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
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("add"),
              onSelect: () => {
                open("new");
              },
            }
          : undefined
      }
    >
      <p className="text-body-sm text-fg-muted">{t("description")}</p>
      <DataTable
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
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
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field
              label={t("columns.code")}
              required
              error={submitted && !code.trim() ? t("codeRequired") : undefined}
            >
              <Input
                value={code}
                maxLength={16}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
              />
            </Field>
            <Field
              label={t("columns.name")}
              required
              error={submitted && !name.trim() ? t("nameRequired") : undefined}
            >
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
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
        tone="danger"
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
    </AppPage>
  );
}
