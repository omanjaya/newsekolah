"use client";

import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  Select,
  domainIcons,
  selectionColumn,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useLookup } from "../../reference/api";
import type { LibraryCopy } from "../api";
import {
  type LibraryCopyStatus,
  useCollectionCategoriesQuery,
  useLibraryCopiesFilteredQuery,
  useLibraryLocationsQuery,
} from "../copies-api";
import { useOrderedSelection } from "../use-ordered-selection";

import { CopyLabelPrintBar } from "./copy-label-print-bar";

const STATUSES: LibraryCopyStatus[] = [
  "available",
  "on_loan",
  "reserved",
  "damaged",
  "lost",
  "in_repair",
  "processing",
  "donated",
  "reserve_stack",
  "unknown",
];

/** Browses every copy in the catalogue, for selecting a batch to label (see title-copies-view for one title's own list). */
export function CopiesBrowserView(): ReactElement {
  const t = useTranslations("app.library.copiesBrowser");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LibraryCopyStatus | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const { selection, onSelectionChange, orderedIds, clear } = useOrderedSelection();

  const { data, isLoading } = useLibraryCopiesFilteredQuery({
    search,
    status,
    categoryId,
    locationId,
    limit: 200,
  });
  const categories = useCollectionCategoriesQuery();
  const locations = useLibraryLocationsQuery();
  const categoryMap = useLookup(categories.data?.data);
  const locationMap = useLookup(locations.data?.data);

  const items = data?.data ?? [];
  const isFiltered = search !== "" || status !== "" || categoryId !== "" || locationId !== "";

  const columns = useMemo<ColumnDef<LibraryCopy>[]>(
    () => [
      selectionColumn<LibraryCopy>(),
      { accessorKey: "barcode", header: t("columns.barcode"), enableSorting: false },
      {
        accessorKey: "accession_number",
        header: t("columns.accessionNumber"),
        enableSorting: false,
      },
      { accessorKey: "call_number", header: t("columns.callNumber"), enableSorting: false },
      {
        id: "category",
        header: t("columns.category"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.category_id ? (categoryMap.get(row.original.category_id)?.name ?? "-") : "-",
      },
      {
        id: "location",
        header: t("columns.location"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.location_id ? (locationMap.get(row.original.location_id)?.name ?? "-") : "-",
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "available" ? "accent" : "neutral"}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/library/catalogue/${row.original.title_id}`}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            {t("viewTitle")}
          </Link>
        ),
      },
    ],
    [t, categoryMap, locationMap],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.status")}</span>
          <Select
            options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
            value={status}
            onValueChange={(v) => {
              setStatus(v as LibraryCopyStatus);
            }}
            placeholder={t("filters.statusAll")}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.category")}</span>
          <Select
            options={(categories.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder={t("filters.categoryAll")}
            className="w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("filters.location")}</span>
          <Select
            options={(locations.data?.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
            value={locationId}
            onValueChange={setLocationId}
            placeholder={t("filters.locationAll")}
            className="w-44"
          />
        </label>
        {isFiltered && (
          <button
            type="button"
            className="text-[13px] text-accent underline underline-offset-2"
            onClick={() => {
              setStatus("");
              setCategoryId("");
              setLocationId("");
              setSearch("");
            }}
          >
            {t("filters.clear")}
          </button>
        )}
      </div>

      <CopyLabelPrintBar selectedIds={orderedIds} onClear={clear} />

      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 200 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        isLoading={isLoading}
        rowSelection={selection}
        onRowSelectionChange={onSelectionChange}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.library aria-hidden="true" />}
            title={isFiltered ? t("noMatchTitle") : t("emptyTitle")}
            description={isFiltered ? t("noMatchBody") : t("emptyBody")}
          />
        }
      />
    </div>
  );
}
