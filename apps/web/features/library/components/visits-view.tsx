"use client";

import type { Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Stat,
  StatGrid,
  domainIcons,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { DoorOpen, Plus, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useDateFilter } from "../../../lib/hooks/use-date-filter";
import { useDateRangePresets } from "../../../lib/hooks/use-date-range-presets";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useCan } from "../../../lib/session/session-provider";
import { startOfIsoMonth, todayInZone } from "../../../lib/tenant-date";
import { useDirectoryNames } from "../../reference/directory-names";
import { useTenantTimeZone } from "../use-tenant-timezone";
import {
  type LibraryVisit,
  useLibraryVisitSummaryQuery,
  useLibraryVisitsQuery,
} from "../visits-api";

import { LibraryWorkspaceNav, useLibraryShortcuts } from "./library-workspace-nav";
import { VisitRecordDialog } from "./visit-record-dialog";

/** Rows per page; the visits API pages by offset and reports no total. */
const VISITS_PAGE_SIZE = 50;

export function VisitsView(): ReactElement {
  const t = useTranslations("app.library.visits");
  const locale = useLocale() as Locale;
  const timeZone = useTenantTimeZone();
  const today = todayInZone(timeZone);
  const canRecord = useCan("manage_library_circulation");
  const canViewMembers = useCan("manage_library_members");

  const [from, setFrom] = useDateFilter("from", startOfIsoMonth(today));
  const [to, setTo] = useDateFilter("to", today);
  const presets = useDateRangePresets();
  const [recording, setRecording] = useState(false);

  const paging = useOffsetPage(VISITS_PAGE_SIZE);
  const shortcuts = useLibraryShortcuts(["visitKiosk", { report: "visits" }]);
  const { data, isLoading, error, refetch, isRefetching } = useLibraryVisitsQuery(
    `${from}T00:00:00Z`,
    `${to}T23:59:59Z`,
    {
      limit: paging.limit,
      offset: paging.offset,
    },
  );
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
        meta: { card: "title" },
        // A visit has no page of its own, so the row does not open; a
        // member's name links to their page in body text (as a student's
        // name does elsewhere), for whoever may open it.
        cell: ({ row }) => {
          const memberId = row.original.member_user_id;
          if (!memberId) return row.original.visitor_name ?? "-";
          const name = directoryMap.get(memberId)?.name ?? t("unknownMember");
          return canViewMembers ? (
            <Link
              href={`/library/members/${memberId}`}
              className="font-semibold text-fg hover:underline focus-visible:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="font-semibold text-fg">{name}</span>
          );
        },
      },
      {
        id: "kind",
        header: t("columns.kind"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{t(`kinds.${row.original.kind}`)}</span>
            {row.original.kind === "group" && row.original.group_size > 1 && (
              <span className="text-caption text-fg-muted">
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
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge tone={row.original.source === "manual" ? "neutral" : "info"}>
            {t(`sources.${row.original.source}`)}
          </Badge>
        ),
      },
      {
        id: "visitedAt",
        header: t("columns.visitedAt"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => (
          <time dateTime={row.original.visited_at} className="tabular-nums">
            {new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone,
            }).format(new Date(row.original.visited_at))}
          </time>
        ),
      },
    ],
    [t, locale, directoryMap, timeZone, canViewMembers],
  );

  const recordButton = canRecord ? (
    <Button
      icon={<Plus />}
      onClick={() => {
        setRecording(true);
      }}
    >
      {t("record")}
    </Button>
  ) : undefined;

  return (
    <AppPage
      nav={<LibraryWorkspaceNav area="circulation" />}
      primaryAction={recordButton}
      secondaryActions={shortcuts}
    >
      <StatGrid variant="strip" aria-label={t("summary.heading")}>
        <Stat
          icon={<DoorOpen />}
          category="purple"
          value={summary.data?.total_visits ?? "-"}
          label={t("summary.totalVisits")}
          loading={summary.isLoading}
        />
        <Stat
          icon={<UsersRound />}
          category="blue"
          value={summary.data?.unique_members ?? "-"}
          label={t("summary.uniqueMembers")}
          loading={summary.isLoading}
        />
        <Stat
          icon={<Users />}
          category="green"
          value={summary.data?.total_people ?? "-"}
          label={t("summary.totalPeople")}
          loading={summary.isLoading}
        />
      </StatGrid>

      <DataTable
        stateKey="features/library/components/visits-view:1"
        mode="cursor"
        searchable={false}
        data={items}
        columns={columns}
        rowCount={items.length}
        cursorPagination={{
          hasPrevious: paging.hasPrevious,
          hasNext: paging.hasNextFor(items.length),
          onPrevious: paging.goPrevious,
          onNext: paging.goNext,
          page: paging.page,
          pageSize: paging.limit,
        }}
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
        error={error}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.users aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={recordButton}
          />
        }
      />

      <VisitRecordDialog
        open={recording}
        onOpenChange={setRecording}
        onRecorded={() => {
          setRecording(false);
        }}
      />
    </AppPage>
  );
}
