"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
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
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import {
  ReportExportDialog,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import {
  downloadJournalExport,
  downloadJournalExportReport,
  useDeleteJournalMutation,
  useJournalsQuery,
  type Journal,
} from "../api";

import { JournalForm } from "./journal-form";

/** {@link ReportExportDialog}'s availableColumns, mirroring journal_export.go's journalReportColumns exactly. */
const JOURNAL_EXPORT_COLUMNS = [
  { key: "date", label: "Tanggal" },
  { key: "class", label: "Kelas" },
  { key: "subject", label: "Mata Pelajaran" },
  { key: "teacher", label: "Guru" },
  { key: "author", label: "Ditulis Oleh" },
  { key: "topic", label: "Topik" },
  { key: "activities", label: "Kegiatan" },
  { key: "reflection", label: "Refleksi" },
];

/**
 * A teacher's own class journals on the web, mirroring apps/mobile's
 * journal screen: the same class/subject/day log saved by the
 * attendance editor.
 */
export function JournalView(): ReactElement {
  const t = useTranslations("app.journal");
  const tApp = useTranslations("app");
  const format = useFormatter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const year = useActiveYear();
  const canViewAll = useCan("view_journals_all");

  const [classId, setClassId] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [editing, setEditing] = useState<Journal | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Journal | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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

  async function handleDocxExport() {
    setDownloadingDocx(true);
    try {
      await downloadJournalExport(year.id, canViewAll && classId ? classId : undefined, "docx");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDownloadingDocx(false);
    }
  }

  async function handleReportExport(options: ReportExportOptions) {
    await downloadJournalExportReport(
      year.id,
      canViewAll && classId ? classId : undefined,
      options,
    );
  }

  const columns = useMemo<ColumnDef<Journal>[]>(
    () => [
      {
        accessorKey: "lesson_date",
        header: t("columns.date"),
        enableSorting: false,
        // lesson_date is a calendar date (YYYY-MM-DD); reading it at local
        // midnight keeps the day from shifting across time zones.
        cell: ({ row }) =>
          format.dateTime(new Date(`${row.original.lesson_date}T00:00:00`), {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
      },
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
    [t, format, classMap, subjectMap],
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // filter/export row stays put. See users-view.tsx for the reference
    // pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
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
          <label className="flex w-full flex-col gap-1 text-[13px] sm:w-auto">
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
              className="w-full sm:w-56"
            />
          </label>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setExportOpen(true);
            }}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("exportXlsx")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={downloadingDocx}
            onClick={() => void handleDocxExport()}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("exportDocx")}
          </Button>
        </div>
      </div>

      <ReportExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        reportKey="journal"
        defaultTitle={t("exportReportTitle")}
        availableColumns={JOURNAL_EXPORT_COLUMNS}
        onExport={handleReportExport}
      />

      <div className="flex flex-col md:min-h-0 md:flex-1">
        {list.isError ? (
          <Alert variant="warning" title={t("loadError")}>
            <div className="flex flex-col items-start gap-2">
              {list.error instanceof ApiError && <p>{apiErrorMessage(list.error.code)}</p>}
              <Button
                variant="secondary"
                loading={list.isRefetching}
                onClick={() => {
                  void list.refetch();
                }}
              >
                {tApp("offlinePage.retry")}
              </Button>
            </div>
          </Alert>
        ) : (
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
            fillHeight
            emptyState={
              <EmptyState
                icon={<NotebookPen aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
                action={
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
            }
          />
        )}
      </div>

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
