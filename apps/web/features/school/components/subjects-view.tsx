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
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSubjectsQuery } from "../../reference/api";
import {
  type Subject,
  useCreateSubjectMutation,
  useDeleteSubjectMutation,
  useUpdateSubjectMutation,
} from "../api";

export function SubjectsView(): ReactElement {
  const t = useTranslations("app.school.subjects");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading } = useSubjectsQuery();
  const create = useCreateSubjectMutation();
  const update = useUpdateSubjectMutation();
  const remove = useDeleteSubjectMutation();
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Subject | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function open(target: Subject | "new") {
    setEditing(target);
    setCode(target === "new" ? "" : target.code);
    setName(target === "new" ? "" : target.name);
  }

  const items = useMemo(() => {
    const all = data?.data ?? [];
    const q = filter.toLowerCase();
    return q
      ? all.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      : all;
  }, [data, filter]);

  const columns = useMemo<ColumnDef<Subject>[]>(
    () => [
      { accessorKey: "code", header: t("columns.code"), enableSorting: false },
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
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
        ),
      },
    ],
    [t],
  );

  async function save() {
    if (!code.trim() || !name.trim()) return;
    try {
      if (editing === "new")
        await create.mutateAsync({ code: code.trim().toUpperCase(), name: name.trim() });
      else if (editing)
        await update.mutateAsync({
          id: editing.id,
          body: { code: code.trim().toUpperCase(), name: name.trim() },
        });
      toast.success(t("saved"));
      setEditing(null);
    } catch (error) {
      fail(error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-medium text-fg">{t("title")}</h2>
        {
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              open("new");
            }}
          >
            {t("add")}
          </Button>
        }
      </div>
      <DataTable
        stateKey="features/school/components/subjects-view:1"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={filter}
        onGlobalFilterChange={setFilter}
        isLoading={isLoading}
        getRowId={(s) => s.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.grades aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
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
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
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
