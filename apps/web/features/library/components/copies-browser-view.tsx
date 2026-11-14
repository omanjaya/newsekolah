"use client";

import {
  Badge,
  DataTable,
  EmptyState,
  FilteredEmptyState,
  TextLink,
  domainIcons,
  selectionColumn,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { AppPage } from "../../../components/app-page";
import { useOffsetPage } from "../../../lib/hooks/use-offset-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { useLookup } from "../../reference/api";
import type { LibraryCopy } from "../api";
import {
  type LibraryCopyStatus,
  useCollectionCategoriesQuery,
  useLibraryCopiesFilteredQuery,
  useLibraryLocationsQuery,
} from "../copies-api";
import { COPY_STATUS_TONE, toneOf } from "../lib/status-tones";
import { useOrderedSelection } from "../use-ordered-selection";

import { CopyBulkStatusAction } from "./copy-bulk-status-bar";
import { CopyLabelPrintAction } from "./copy-label-print-bar";
import { LibraryTitleName } from "./library-title-name";
import { LibraryWorkspaceNav, useLibraryShortcuts } from "./library-workspace-nav";

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

/** Rows per page; the copies API pages by offset and reports no total. */
const COPIES_PAGE_SIZE = 50;

/**
 * Browses every copy in the catalogue: which book each is (a link to its
 * title), where it sits and its status, with label printing and a bulk
 * status change for the selected copies (catalogue managers only).
 */
export function CopiesBrowserView(): ReactElement {
  const t = useTranslations("app.library.copiesBrowser");
  const canManage = useCan("manage_library_catalog");
  const [search, setSearch] = useRememberedViewState("copies-search", "");
  const [status, setStatus] = useUrlState<LibraryCopyStatus | "">(
    "status",
    (value) => STATUSES.includes(value as LibraryCopyStatus),
    "",
  );
  const [categoryId, setCategoryId] = useUrlState<string>("category_id", () => true, "");
  const [locationId, setLocationId] = useUrlState<string>("location_id", () => true, "");
  const { selection, onSelectionChange, orderedIds, clear } = useOrderedSelection();
  const shortcuts = useLibraryShortcuts(["catalogueSettings", { report: "accessionRegister" }]);

  const paging = useOffsetPage(COPIES_PAGE_SIZE);
  const { data, isLoading, error, refetch, isRefetching } = useLibraryCopiesFilteredQuery({
    search,
    status,
    categoryId,
    locationId,
    limit: paging.limit,
    offset: paging.offset,
  });
  const categories = useCollectionCategoriesQuery();
  const locations = useLibraryLocationsQuery();
  const categoryMap = useLookup(categories.data?.data);
  const locationMap = useLookup(locations.data?.data);

  const items = data?.data ?? [];
  const isFiltered = search !== "" || status !== "" || categoryId !== "" || locationId !== "";

  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("filters.status"),
      value: status,
      onChange: (value) => {
        setStatus(value as LibraryCopyStatus | "");
        paging.resetPage();
      },
      options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    },
    {
      id: "category",
      label: t("filters.category"),
      value: categoryId,
      onChange: paging.resetting(setCategoryId),
      options: (categories.data?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    },
    {
      id: "location",
      label: t("filters.location"),
      value: locationId,
      onChange: paging.resetting(setLocationId),
      options: (locations.data?.data ?? []).map((l) => ({ value: l.id, label: l.name })),
    },
  ];

  const columns = useMemo<ColumnDef<LibraryCopy>[]>(
    () => [
      ...(canManage ? [selectionColumn<LibraryCopy>()] : []),
      {
        id: "title",
        header: t("columns.title"),
        enableSorting: false,
        meta: { card: "title", skeleton: "lines" },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <TextLink
              href={`/library/catalogue/${row.original.title_id}`}
              className="font-semibold"
            >
              <LibraryTitleName titleId={row.original.title_id} />
            </TextLink>
            <span className="text-caption text-fg-muted tabular-nums">
              {row.original.barcode}
              {row.original.accession_number &&
              row.original.accession_number !== row.original.barcode
                ? ` · ${row.original.accession_number}`
                : ""}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "call_number",
        header: t("columns.callNumber"),
        enableSorting: false,
        meta: { card: "subtitle" },
        cell: ({ row }) => row.original.call_number ?? "-",
      },
      {
        id: "category",
        header: t("columns.category"),
        enableSorting: false,
        meta: { card: "hidden" },
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
        meta: { card: "meta", skeleton: "badge" },
        cell: ({ row }) => (
          <Badge tone={toneOf(COPY_STATUS_TONE, row.original.status)}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
    ],
    [t, categoryMap, locationMap, canManage],
  );

  return (
    <AppPage
      variant="fit"
      nav={<LibraryWorkspaceNav area="catalogue" />}
      secondaryActions={shortcuts}
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/library/components/copies-browser-view:1"
          data={items}
          mode="cursor"
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
          globalFilter={search}
          onGlobalFilterChange={paging.resetting(setSearch)}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          filters={filters}
          filtersLabels={{
            reset: t("filters.clear"),
            removeFilter: (label) => t("filters.removeFilter", { label }),
          }}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          retrying={isRefetching}
          rowSelection={canManage ? selection : undefined}
          onRowSelectionChange={canManage ? onSelectionChange : undefined}
          bulkActions={
            canManage ? (
              <>
                <CopyLabelPrintAction selectedIds={orderedIds} />
                <CopyBulkStatusAction selectedIds={orderedIds} onDone={clear} />
              </>
            ) : undefined
          }
          getRowId={(item) => item.id}
          fillHeight
          emptyState={
            isFiltered ? (
              <FilteredEmptyState
                title={t("noMatchTitle")}
                description={t("noMatchBody")}
                onReset={() => {
                  setSearch("");
                  setStatus("");
                  setCategoryId("");
                  setLocationId("");
                  paging.resetPage();
                }}
              />
            ) : (
              <EmptyState
                icon={<domainIcons.library aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            )
          }
        />
      </div>
    </AppPage>
  );
}
