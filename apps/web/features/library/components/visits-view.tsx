"use client";

import { formatDateTime } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  domainIcons,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { CursorPagination } from "../../../components/cursor-pagination";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useCan } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type LibraryVisit,
  useLibraryVisitSummaryQuery,
  useLibraryVisitsQuery,
} from "../visits-api";

import { LibraryWorkspaceNav } from "./library-workspace-nav";
import { VisitRecordDialog } from "./visit-record-dialog";

/** Rows per page; the visits API pages by offset and reports no total. */
const VISITS_PAGE_SIZE = 50;

function todayIso(): string {
  return businessNow().toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = businessNow();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function VisitsView(): ReactElement {
  const t = useTranslations("app.library.visits");
  const locale = useLocale() as Locale;
  const canRecord = useCan("manage_library_circulation");

  const [from, setFrom] = useDateFilter("from", firstOfMonthIso());
  const [to, setTo] = useDateFilter("to", todayIso());
  const presets = useDateRangePresets();
  const [recording, setRecording] = useState(false);

  const paging = useOffsetPage(VISITS_PAGE_SIZE);
  const { data, isLoading } = useLibraryVisitsQuery(`${from}T00:00:00Z`, `${to}T23:59:59Z`, {
    limit: paging.limit,
    offset: paging.offset,
  });
  const summary = useLibraryVisitSummaryQuery();

  const items = data?.data ?? [];
  const directoryMap = useDirectoryNames(items.map((item) => item.member_user_id));

  const filters: DataTableFilterDef[] = [
    {
      id: "period",
      label: t("dateRange"),
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

  const columns = useMemo<ColumnDef<LibraryVisit>[]>(
    () => [
      {
        id: "who",
        header: t("columns.who"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.member_user_id ? (
            <Link
              href={`/library/members/${row.original.member_user_id}`}
              className="inline-flex min-h-11 items-center font-medium text-accent hover:underline md:min-h-0"
            >
              {directoryMap.get(row.original.member_user_id)?.name ?? t("unknownMember")}
            </Link>
          ) : (
            (row.original.visitor_name ?? "-")
          ),
      },
      {
        id: "kind",
        header: t("columns.kind"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{t(`kinds.${row.original.kind}`)}</span>
            {row.original.kind === "group" && row.original.group_size > 1 && (
              <span className="text-[12px] text-fg-muted">
                {t("groupSizeValue", { count: row.original.group_size })}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "purpose",
        header: t("columns.purpose"),
        enableSorting: false,
        cell: ({ row }) => row.original.purpose ?? "-",
      },
      {
        id: "source",
        header: t("columns.source"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.source === "manual" ? "neutral" : "accent"}>
            {t(`sources.${row.original.source}`)}
          </Badge>
        ),
      },
      {
        id: "visitedAt",
        header: t("columns.visitedAt"),
        enableSorting: false,
        cell: ({ row }) => formatDateTime(row.original.visited_at, { locale }),
      },
    ],
    [t, locale, directoryMap],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canRecord && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setRecording(true);
              }}
            >
              {t("record")}
            </Button>
          )
        }
      />
      <LibraryWorkspaceNav area="visits" />

      <dl className="flex flex-wrap gap-6 rounded-sm border border-border bg-surface p-4 text-[13px]">
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t("summary.totalVisits")}</dt>
          <dd className="text-[20px] font-medium tabular-nums text-fg">
            {summary.data?.total_visits ?? "-"}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t("summary.uniqueMembers")}</dt>
          <dd className="text-[20px] font-medium tabular-nums text-fg">
            {summary.data?.unique_members ?? "-"}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t("summary.totalPeople")}</dt>
          <dd className="text-[20px] font-medium tabular-nums text-fg">
            {summary.data?.total_people ?? "-"}
          </dd>
        </div>
      </dl>

      <DataTable
        stateKey="features/library/components/visits-view:1"
        mode="cursor"
        searchable={false}
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: VISITS_PAGE_SIZE }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        filters={filters}
        filtersLabels={{
          reset: t("reset"),
          removeFilter: (label) => t("removeFilter", { label }),
          dateRangeFrom: t("fromLabel"),
          dateRangeTo: t("toLabel"),
          dateRangeInvalid: t("invalidRange"),
        }}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.users aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
      <CursorPagination
        hasPrevious={paging.hasPrevious}
        hasNext={paging.hasNextFor(items.length)}
        onPrevious={paging.goPrevious}
        onNext={paging.goNext}
      />

      <VisitRecordDialog
        open={recording}
        onOpenChange={setRecording}
        onRecorded={() => {
          setRecording(false);
        }}
      />
    </div>
  );
}
