"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { PaginationState } from "@tanstack/react-table";
import { Download, NotebookPen, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import {
  ReportExportDialog,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import {
  downloadJournalExport,
  downloadJournalExportReport,
  useDeleteJournalMutation,
  useJournalsQuery,
  type Journal,
} from "../api";
import { computeJournalWeekStats } from "../lib/journal-week-stats";

import { useJournalColumns } from "./journal-columns";
import { JournalForm } from "./journal-form";
import { JournalStatTiles } from "./journal-stat-tiles";
import { JournalTodayPanel, useJournalTodayData } from "./journal-today-panel";

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

  const [classId, setClassId] = useUrlState<string>("class_id", () => true, "");
  const [from, setFrom] = useDateFilter("from", "");
  const [to, setTo] = useDateFilter("to", "");
  const presets = useDateRangePresets();
  const [search, setSearch] = useRememberedViewState("journal-search", "");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [editing, setEditing] = useState<Journal | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Journal | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const todayData = useJournalTodayData();
  const weekStats = computeJournalWeekStats(todayData.groups, todayData.today);

  const list = useJournalsQuery(
    canViewAll && classId ? classId : undefined,
    pagination.pageIndex,
    pagination.pageSize,
    search || undefined,
    from || undefined,
    to || undefined,
  );
  const remove = useDeleteJournalMutation();

  function resetPaging() {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }

  const filters: DataTableFilterDef[] = [
    ...(canViewAll
      ? [
          {
            id: "class",
            label: t("filterClass"),
            value: classId,
            onChange: (value: string) => {
              setClassId(value);
              resetPaging();
            },
            options: (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          },
        ]
      : []),
    {
      id: "period",
      label: t("filters.dateRange"),
      type: "dateRange",
      from,
      to,
      onChangeRange: ({ from: nextFrom, to: nextTo }) => {
        setFrom(nextFrom);
        setTo(nextTo);
        resetPaging();
      },
      presets,
    },
  ];

  const items = useMemo(
    () => [...(list.data?.data ?? [])].sort((a, b) => (a.lesson_date < b.lesson_date ? 1 : -1)),
    [list.data],
  );

  async function handleDocxExport() {
    setDownloadingDocx(true);
    try {
      await downloadJournalExport(
        year.id,
        canViewAll && classId ? classId : undefined,
        "docx",
        from || undefined,
        to || undefined,
      );
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
      from || undefined,
      to || undefined,
    );
  }

  const columns = useJournalColumns({
    t,
    // lesson_date is a calendar date (YYYY-MM-DD); reading it at local
    // midnight keeps the day from shifting across time zones.
    formatDate: (lessonDate) =>
      format.dateTime(new Date(`${lessonDate}T00:00:00`), {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    classMap,
    subjectMap,
    onEdit: setEditing,
    onDelete: setPendingDelete,
  });

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // filter/export row stays put. See users-view.tsx for the reference
    // pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <AcademicWorkspaceLinks area="attendance" />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full"
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
              className="rounded-full"
              loading={downloadingDocx}
              onClick={() => void handleDocxExport()}
            >
              <Download className="size-4" aria-hidden="true" />
              {t("exportDocx")}
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              icon={<Plus />}
              onClick={() => {
                setEditing("new");
              }}
            >
              {t("new")}
            </Button>
          </>
        }
      />

      <JournalStatTiles weekStats={weekStats} />

      <JournalTodayPanel />

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
            globalFilter={search}
            onGlobalFilterChange={(value) => {
              setSearch(value);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
            filters={filters}
            filtersLabels={{
              reset: t("filters.reset"),
              removeFilter: (label) => t("filters.removeFilter", { label }),
              dateRangeFrom: t("filters.from"),
              dateRangeTo: t("filters.to"),
              dateRangeInvalid: t("filters.invalidRange"),
            }}
            toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
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
