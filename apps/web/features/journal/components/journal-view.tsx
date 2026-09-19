"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  PageHeader,
  Select,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Download, MoreHorizontal, NotebookPen, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import {
  downloadJournalExport,
  useDeleteJournalMutation,
  useJournalsQuery,
  type Journal,
} from "../api";

import { JournalForm } from "./journal-form";

/**
 * A teacher's own class journals on the web, mirroring apps/mobile's
 * journal screen: the same class/subject/day log saved by the
 * attendance editor.
 */
export function JournalView(): ReactElement {
  const t = useTranslations("app.journal");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const year = useActiveYear();
  const canViewAll = useCan("view_journals_all");

  const [classId, setClassId] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [editing, setEditing] = useState<Journal | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Journal | null>(null);
  const [downloading, setDownloading] = useState<"xlsx" | "docx" | null>(null);

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);

  const list = useJournalsQuery(
    canViewAll && classId ? classId : undefined,
    pagination.pageIndex,
    pagination.pageSize,
  );
  const remove = useDeleteJournalMutation();

  const items = useMemo(
    () => [...(list.data?.data ?? [])].sort((a, b) => (a.lesson_date < b.lesson_date ? 1 : -1)),
    [list.data],
  );

  async function handleExport(format: "xlsx" | "docx") {
    setDownloading(format);
    try {
      await downloadJournalExport(year.id, canViewAll && classId ? classId : undefined, format);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDownloading(null);
    }
  }

  const columns = useMemo<ColumnDef<Journal>[]>(
    () => [
      { accessorKey: "lesson_date", header: t("columns.date"), enableSorting: false },
      {
        id: "class",
        header: t("columns.class"),
        enableSorting: false,
        cell: ({ row }) => classMap.get(row.original.class_id)?.name ?? t("unknown"),
      },
      {
        id: "subject",
        header: t("columns.subject"),
        enableSorting: false,
        cell: ({ row }) => subjectMap.get(row.original.subject_id)?.name ?? t("unknown"),
      },
      {
        accessorKey: "topic",
        header: t("columns.topic"),
        enableSorting: false,
        cell: ({ row }) => <span className="line-clamp-1">{row.original.topic}</span>,
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreHorizontal />} aria-label={t("columns.actions")} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(row.original);
                }}
              >
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setPendingDelete(row.original);
                }}
              >
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t, classMap, subjectMap],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("new")}
          </Button>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        {canViewAll && (
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-fg">{t("filterClass")}</span>
            <Select
              options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              value={classId}
              onValueChange={(value) => {
                setClassId(value);
                setPagination((current) => ({ ...current, pageIndex: 0 }));
              }}
              placeholder={t("filterClassAll")}
              disabled={classes.isLoading}
              aria-label={t("filterClass")}
              className="w-56"
            />
          </label>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={downloading === "xlsx"}
            onClick={() => void handleExport("xlsx")}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("exportXlsx")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={downloading === "docx"}
            onClick={() => void handleExport("docx")}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("exportDocx")}
          </Button>
        </div>
      </div>

      <DataTable
        stateKey="features/journal/components/journal-view:1"
        mode="server"
        data={items}
        columns={columns}
        rowCount={list.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={list.isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<NotebookPen aria-hidden="true" />}
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
        <DialogContent title={editing === "new" ? t("new") : t("edit")}>
          {editing !== null && (
            <JournalForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
                setPagination((current) => ({ ...current, pageIndex: 0 }));
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={pendingDelete ? t("deleteBody", { topic: pendingDelete.topic }) : ""}
        confirmLabel={t("delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            if (items.length === 1 && pagination.pageIndex > 0) {
              setPagination((current) => ({ ...current, pageIndex: current.pageIndex - 1 }));
            }
            toast.success(t("deleted"));
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
