"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  domainIcons,
  EmptyState,
  FilteredEmptyState,
  SemanticStatusBadge,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery } from "../../reference/api";
import { useDirectoryNamePeek, useDirectoryNames } from "../../reference/directory-names";
import { type ViolationRecord, useViolationsQuery } from "../api";
import { studentDisciplineHref } from "../href";

import { ViolationRecordForm } from "./violation-record-form";
import { type SaveSummary, ViolationSaveSummary } from "./violation-save-summary";
import { ViolationVoidDialog } from "./violation-void-dialog";

/** Rows per page; the violations API pages by offset and reports no total. */
const PAGE_SIZE = 50;

export function ViolationsLedgerView({
  recording,
  onRecordingChange,
}: {
  /** The record dialog's state lives with the page, whose header holds the action. */
  recording: boolean;
  onRecordingChange: (recording: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.discipline.violations");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canRecord = useCan("record_violations");

  const [classId, setClassId] = useUrlState<string>("class_id", () => true, "");
  const [from, setFrom] = useDateFilter("from", "");
  const [to, setTo] = useDateFilter("to", "");
  const presets = useDateRangePresets();
  const [includeVoidedParam, setIncludeVoidedParam] = useUrlState<"" | "true">(
    "include_voided",
    ["", "true"],
    "",
  );
  const includeVoided = includeVoidedParam === "true";
  const [voiding, setVoiding] = useState<ViolationRecord | null>(null);
  const [saveSummaries, setSaveSummaries] = useState<SaveSummary[]>([]);

  const classes = useClassesQuery();
  const [search, setSearch] = useUrlState<string>("ledger_q", () => true, "");
  const paging = useOffsetPage(PAGE_SIZE, "ledger_page");
  const { data, isLoading, error, refetch } = useViolationsQuery(
    { classId, from, to, includeVoided },
    { limit: paging.limit, offset: paging.offset, search },
  );

  const items = data?.data ?? [];
  const filtering = search !== "" || classId !== "" || from !== "" || to !== "" || includeVoided;
  function resetFilters() {
    setSearch("");
    setClassId("");
    setFrom("");
    setTo("");
    setIncludeVoidedParam("");
    paging.resetPage();
  }
  const studentMap = useDirectoryNames(items.map((item) => item.student_user_id));
  const peekName = useDirectoryNamePeek();
  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const filters: DataTableFilterDef[] = [
    {
      id: "class",
      label: t("filters.class"),
      value: classId,
      onChange: paging.resetting(setClassId),
      options: classOptions,
    },
    {
      id: "includeVoided",
      label: t("filters.includeVoided"),
      value: includeVoidedParam,
      onChange: (value) => {
        setIncludeVoidedParam(value as "" | "true");
        paging.resetPage();
      },
      type: "boolean",
      activeValue: "true",
    },
    {
      id: "period",
      label: t("filters.dateRange"),
      type: "dateRange",
      from,
      to,
      onChangeRange: ({ from: nextFrom, to: nextTo }) => {
        setFrom(nextFrom);
        setTo(nextTo);
        paging.resetPage();
      },
      presets,
    },
  ];

  const columns = useMemo<ColumnDef<ViolationRecord>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        meta: { card: "title", label: t("columns.student") },
        // Plain text: the row opens the student's discipline record, which
        // links on to the profile, so the row has one destination.
        cell: ({ row }) => {
          const name = studentMap.get(row.original.student_user_id)?.name;
          if (!name) return t("unknownStudent");
          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size={32} name={name} />
              <span className="truncate">{name}</span>
            </div>
          );
        },
      },
      {
        id: "type",
        header: t("columns.type"),
        enableSorting: false,
        meta: { card: "subtitle", label: t("columns.type") },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.type_name}</span>
            {row.original.notes && (
              <span className="text-caption font-normal text-fg-muted">{row.original.notes}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "points",
        header: t("columns.points"),
        enableSorting: false,
        meta: { card: "field", label: t("columns.points"), align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">{t("pointsValue", { points: row.original.points })}</span>
        ),
      },
      {
        id: "date",
        header: t("columns.date"),
        enableSorting: false,
        meta: { card: "field", label: t("columns.date") },
        cell: ({ row }) => formatDate(row.original.occurred_on, { locale }),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        meta: { card: "meta", label: t("columns.status") },
        cell: ({ row }) => (
          <SemanticStatusBadge
            status={row.original.is_voided ? "cancelled" : "active"}
            label={t(row.original.is_voided ? "status.voided" : "status.active")}
          />
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        meta: { label: t("columns.actions") },
        cell: ({ row }) =>
          canRecord && !row.original.is_voided ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                setVoiding(row.original);
              }}
            >
              {t("void")}
            </Button>
          ) : null,
      },
    ],
    [t, locale, studentMap, canRecord],
  );

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      {saveSummaries.length > 0 && (
        <ViolationSaveSummary
          summaries={saveSummaries}
          onIssued={(studentId) => {
            setSaveSummaries((prev) => prev.filter((s) => s.studentId !== studentId));
          }}
          onDismiss={() => {
            setSaveSummaries([]);
          }}
        />
      )}

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/discipline/components/violations-ledger-view:1"
          mode="cursor"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: PAGE_SIZE }}
          onPaginationChange={() => undefined}
          cursorPagination={{
            hasPrevious: paging.hasPrevious,
            hasNext: paging.hasNextFor(items.length),
            onPrevious: paging.goPrevious,
            onNext: paging.goNext,
            page: paging.page,
            pageSize: paging.limit,
          }}
          error={error}
          onRetry={() => void refetch()}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={paging.resetting(setSearch)}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          filters={filters}
          filtersLabels={{
            reset: t("filters.reset"),
            removeFilter: (label) => t("filters.removeFilter", { label }),
            dateRangeFrom: t("filters.from"),
            dateRangeTo: t("filters.to"),
            dateRangeInvalid: t("filters.invalidRange"),
          }}
          isLoading={isLoading}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            router.push(studentDisciplineHref(item.student_user_id));
          }}
          fillHeight
          emptyState={
            filtering ? (
              <FilteredEmptyState onReset={resetFilters} />
            ) : (
              <EmptyState
                icon={<domainIcons.violation aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
                // The header carries the primary; the empty list repeats it quietly.
                action={
                  canRecord ? (
                    <Button
                      variant="secondary"
                      icon={<Plus />}
                      onClick={() => {
                        onRecordingChange(true);
                      }}
                    >
                      {t("record")}
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </div>

      <Dialog open={recording} onOpenChange={onRecordingChange}>
        <DialogContent title={t("form.title")} description={t("form.description")} size="lg">
          {recording && (
            <ViolationRecordForm
              onDone={(results) => {
                onRecordingChange(false);
                if (results && results.length > 0) {
                  setSaveSummaries(
                    results.map((result) => {
                      const student = peekName(result.record.student_user_id);
                      return {
                        studentId: result.record.student_user_id,
                        studentName: student?.name ?? t("unknownStudent"),
                        totalPoints: result.total_points,
                        dueLevels: [...result.due_levels].sort((a, b) => a.level - b.level),
                      };
                    }),
                  );
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ViolationVoidDialog
        record={voiding}
        studentName={
          voiding ? (studentMap.get(voiding.student_user_id)?.name ?? t("unknownStudent")) : ""
        }
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
      />
    </div>
  );
}
