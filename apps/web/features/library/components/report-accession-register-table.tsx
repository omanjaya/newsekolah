"use client";

import type { Locale } from "@newsekolah/i18n";
import { DataTable, EmptyState, TextLink, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";

import type { LibraryCopy } from "../api";
import { formatShortDate } from "../lib/short-date";
import { useLibraryAccessionRegisterReportQuery } from "../reports-api";

import { LibraryTitleName } from "./library-title-name";

/** Copies acquired in the period, in acquisition order (Buku Induk). */
export function ReportAccessionRegisterTable({
  from,
  to,
  emptyAction,
}: {
  from: string;
  to: string;
  /** The empty state's way on, such as stepping back a month. */
  emptyAction?: ReactNode;
}): ReactElement {
  const t = useTranslations("app.library.reports.accessionRegister");
  const locale = useLocale() as Locale;
  const { data, isLoading, error, refetch } = useLibraryAccessionRegisterReportQuery(from, to);
  const copies = data?.data ?? [];

  const columns = useMemo<ColumnDef<LibraryCopy>[]>(
    () => [
      {
        id: "title",
        header: t("columns.title"),
        enableSorting: false,
        meta: { card: "title" },
        cell: ({ row }) => (
          <TextLink href={`/library/catalogue/${row.original.title_id}`}>
            <LibraryTitleName titleId={row.original.title_id} />
          </TextLink>
        ),
      },
      {
        accessorKey: "accession_number",
        header: t("columns.accessionNumber"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.accession_number}</span>,
      },
      {
        accessorKey: "barcode",
        header: t("columns.barcode"),
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{row.original.barcode}</span>,
      },
      {
        accessorKey: "acquired_on",
        header: t("columns.acquiredOn"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.acquired_on ? formatShortDate(row.original.acquired_on, locale) : "-",
      },
    ],
    [t, locale],
  );

  return (
    <DataTable
      stateKey="features/library/components/report-accession-register-table:1"
      mode="local"
      data={copies}
      columns={columns}
      searchable={copies.length > 10}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      getRowId={(copy) => copy.id}
      emptyState={
        <EmptyState
          icon={<domainIcons.library aria-hidden="true" />}
          title={t("emptyTitle")}
          action={emptyAction}
        />
      }
    />
  );
}
