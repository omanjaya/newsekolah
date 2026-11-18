"use client";

import { DataTable, EmptyState, domainIcons } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { useLibraryDdcClassesQuery } from "../master-data-api";

type DdcClass = NonNullable<ReturnType<typeof useLibraryDdcClassesQuery>["data"]>["data"][number];

/** The ten top-level Dewey Decimal classes; a read-only reference for cataloguing. */
export function DdcClassesTab(): ReactElement {
  const t = useTranslations("app.library.masterData.ddcClasses");
  const { data, isLoading, error, refetch } = useLibraryDdcClassesQuery();
  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<DdcClass>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
      },
      {
        accessorKey: "code",
        header: t("columns.code"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.code}</span>,
      },
    ],
    [t],
  );

  return (
    <DataTable
      stateKey="features/library/components/ddc-classes-tab:1"
      mode="local"
      data={items}
      columns={columns}
      searchable={false}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      getRowId={(item) => item.code}
      emptyState={
        <EmptyState
          icon={<domainIcons.library aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      }
    />
  );
}
