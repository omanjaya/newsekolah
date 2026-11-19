"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  cn,
  useToast,
  type DataTableFilterDef,
  type PageHeaderAction,
} from "@newsekolah/ui";
import type { PaginationState } from "@tanstack/react-table";
import { FileSpreadsheet, FileText, NotebookPen, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import {
  ReportExportDialog,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
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
import { JournalTodayPanel, useJournalTodayData } from "./journal-today-panel";

/** {@link ReportExportDialog}'s availableColumns, mirroring journal_export.go's journalReportColumns exactly. */
const JOURNAL_EXPORT_COLUMNS = [
  "date",
  "class",
  "subject",
  "teacher",
  "author",
  "topic",
  "activities",
  "reflection",
] as const;

/**
 * A teacher's own class journals on the web, mirroring apps/mobile's
 * journal screen: the same class/subject/day log saved by the
 * attendance editor.
 */
export function JournalView(): ReactElement {
  const t = useTranslations("app.journal");
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

  const exportColumns = JOURNAL_EXPORT_COLUMNS.map((key) => ({
    key,
    label: t(`exportColumns.${key}`),
  }));

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
    // lesson_date is a calendar date (YYYY-MM-DD): that day for everyone.
    formatDate: (lessonDate) =>
      formatCalendarDate(format, lessonDate, {
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

  // The downloads are page actions, not table tools: buttons beside the
  // title from 640px up, folded into the title line's menu on a phone,
  // instead of a full-width bar above the search.
  const downloads: PageHeaderAction[] = [
    {
      label: t("downloadReport"),
      icon: <FileSpreadsheet />,
      onSelect: () => {
        setExportOpen(true);
      },
    },
    {
      label: t("downloadDocx"),
      icon: <FileText />,
      disabled: downloadingDocx,
      onSelect: () => void handleDocxExport(),
    },
  ];

  // The backlog rail takes its 22rem column only while it shows something
  // (loading, an error, or the week's lessons); a reader without a
  // timetable gets the history at the page's full width.
  const hasRail = todayData.loading || todayData.isError || todayData.groups.length > 0;

  return (
    // The history fills the screen on desktop and scrolls inside its table,
    // beside the backlog as a rail of its own, so neither can squeeze the
    // other to nothing; a phone stacks the backlog above the history.
    <AppPage
      variant="fit"
      description={t("weekSummary", { count: weekStats.filledThisWeek })}
      primaryAction={
        <Button
          icon={<Plus />}
          onClick={() => {
            setEditing("new");
          }}
        >
          {t("new")}
        </Button>
      }
      primaryActionCompact={{
        icon: <Plus />,
        label: t("new"),
        onSelect: () => {
          setEditing("new");
        },
      }}
      secondaryActions={downloads}
    >
      <ReportExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        reportKey="journal"
        defaultTitle={t("exportReportTitle")}
        availableColumns={exportColumns}
        onExport={handleReportExport}
      />

      <div
        className={cn(
          "flex flex-col gap-6 md:min-h-0 md:flex-1 lg:grid lg:grid-rows-[minmax(0,1fr)]",
          hasRail ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "lg:grid-cols-[minmax(0,1fr)]",
        )}
      >
        <JournalTodayPanel className="lg:order-last lg:max-h-full lg:self-start" />
        <div className="flex min-h-96 flex-col md:min-h-0 md:flex-1">
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
              dateRangeFrom: t("filters.from"),
              dateRangeTo: t("filters.to"),
              dateRangeInvalid: t("filters.invalidRange"),
            }}
            toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
            isLoading={list.isLoading}
            error={list.error ?? list.isError}
            onRetry={() => {
              void list.refetch();
            }}
            getRowId={(item) => item.id}
            fillHeight
            // "Jurnal baru" is already the header's one primary action, so
            // the empty history only explains itself.
            emptyState={
              <EmptyState
                icon={<NotebookPen aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            }
          />
        </div>
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
    </AppPage>
  );
}
