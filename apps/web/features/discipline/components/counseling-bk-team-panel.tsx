"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  DataTable,
  EmptyState,
  domainIcons,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { CursorPagination } from "../../../components/cursor-pagination";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { type Counseling, type CounselingTopic } from "../api";
import { useBKTeamCounselingsQuery } from "../api-counseling-extras";

/** Rows per page; the counseling API pages by offset and reports no total. */
const PAGE_SIZE = 50;
const TOPICS: CounselingTopic[] = ["career", "problem", "personal", "learning", "social", "other"];
const TOPIC_VALUES = ["", ...TOPICS] as const;

/**
 * Notes shared with the whole BK team (visibility "bk_team"), for a
 * counselor to see what colleagues are handling. The API further requires
 * the caller to be a duty counselor; a caller who is not sees an empty
 * list rather than an error, so the empty state stays honest either way.
 */
export function CounselingBKTeamPanel({ onOpen }: { onOpen: (id: string) => void }): ReactElement {
  const t = useTranslations("app.discipline.counseling");
  const locale = useLocale() as Locale;
  const [topic, setTopic] = useUrlState<(typeof TOPIC_VALUES)[number]>("topic", TOPIC_VALUES, "");

  const [search, setSearch] = useUrlState<string>("team_q", () => true, "");
  const paging = useOffsetPage(PAGE_SIZE, "team_page");
  const { data, isLoading } = useBKTeamCounselingsQuery(topic, {
    limit: paging.limit,
    offset: paging.offset,
    search,
  });
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);

  const items = data?.data ?? [];

  const filters: DataTableFilterDef[] = [
    {
      id: "topic",
      label: t("bkTeam.topicFilter"),
      value: topic,
      onChange: (value) => {
        setTopic(value as (typeof TOPIC_VALUES)[number]);
        paging.resetPage();
      },
      options: TOPICS.map((topicOption) => ({
        value: topicOption,
        label: t(`form.topicOptions.${topicOption}`),
      })),
    },
  ];

  const columns = useMemo<ColumnDef<Counseling>[]>(
    () => [
      { accessorKey: "title", header: t("columns.title"), enableSorting: false },
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) => {
          const student = studentMap.get(row.original.student_user_id);
          return student ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar size="sm" name={student.name} />
              <span className="truncate">{student.name}</span>
            </div>
          ) : (
            t("unknownStudent")
          );
        },
      },
      {
        id: "date",
        header: t("columns.date"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.session_at, { locale }),
      },
      {
        id: "topic",
        header: t("columns.topic"),
        enableSorting: false,
        cell: ({ row }) => t(`form.topicOptions.${row.original.topic}`),
      },
    ],
    [t, locale, studentMap],
  );

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/discipline/components/counseling-bk-team-panel:1"
          mode="cursor"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: PAGE_SIZE }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={paging.resetting(setSearch)}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          filters={filters}
          filtersLabels={{
            reset: t("bkTeam.reset"),
            removeFilter: (label) => t("bkTeam.removeFilter", { label }),
          }}
          isLoading={isLoading}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            onOpen(item.id);
          }}
          fillHeight
          emptyState={
            <EmptyState
              icon={<domainIcons.users aria-hidden="true" />}
              title={t("bkTeam.emptyTitle")}
              description={t("bkTeam.emptyBody")}
            />
          }
        />
      </div>
      <CursorPagination
        hasPrevious={paging.hasPrevious}
        hasNext={paging.hasNextFor(items.length)}
        onPrevious={paging.goPrevious}
        onNext={paging.goNext}
      />
    </div>
  );
}
