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

import type { OffsetPage } from "../../../lib/hooks/use-offset-page";
import { useDirectoryNames } from "../../reference/directory-names";
import { StudentLink } from "../../students/components/student-link";
import { type Counseling } from "../api";

/**
 * The table of notes their authors shared with an audience (the BK team,
 * or school leadership): title, student, session date and topic, paged by
 * offset like every counseling list. The panels own the query and say what
 * an empty list means.
 */
export function CounselingSharedTable({
  stateKey,
  items,
  isLoading,
  error,
  onRetry,
  paging,
  search,
  onSearchChange,
  filters,
  emptyTitle,
  emptyBody,
  onOpen,
}: {
  stateKey: string;
  items: Counseling[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  paging: OffsetPage;
  search: string;
  onSearchChange: (value: string) => void;
  filters?: DataTableFilterDef[];
  emptyTitle: string;
  emptyBody: string;
  onOpen: (id: string) => void;
}): ReactElement {
  const t = useTranslations("app.discipline.counseling");
  const locale = useLocale() as Locale;
  const studentMap = useDirectoryNames(items.map((item) => item.student_user_id));

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
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size={32} name={student.name} />
              <span className="truncate">
                <StudentLink studentId={student.id} tab="counseling">
                  {student.name}
                </StudentLink>
              </span>
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
          stateKey={stateKey}
          mode="cursor"
          data={items}
          columns={columns}
          rowCount={items.length}
          pagination={{ pageIndex: 0, pageSize: paging.limit }}
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
          onRetry={onRetry}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={paging.resetting(onSearchChange)}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          filters={filters}
          isLoading={isLoading}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            onOpen(item.id);
          }}
          fillHeight
          emptyState={
            <EmptyState
              icon={<domainIcons.users aria-hidden="true" />}
              title={emptyTitle}
              description={emptyBody}
            />
          }
        />
      </div>
    </div>
  );
}
