"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Table,
} from "@tanstack/react-table";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn.js";
import { useUiLabels } from "../ui-labels.js";

import { DataTableBody, type DataTableDensity } from "./data-table-body.js";
import { DataTableCards } from "./data-table-cards.js";
import type { DataTableFilterDef, DataTableFiltersLabels } from "./data-table-filters.js";
import { DataTableHead } from "./data-table-head.js";
import {
  DataTableCursorFooter,
  DataTablePagination,
  type DataTableCursorPagination,
  type DataTablePaginationLabels,
} from "./data-table-pagination.js";
import { useDataTableState } from "./data-table-state.js";
import {
  DataTableEmptySlot,
  DataTableErrorState,
  DataTableSearchEmptyState,
} from "./data-table-states.js";
import {
  DataTableToolbar,
  getDataTableColumnLabel,
  toolbarLabelsFrom,
  type DataTableToolbarLabels,
} from "./data-table-toolbar.js";
import { useDebouncedCallback } from "./use-debounced-callback.js";
import { usePersistedColumnVisibility } from "./use-persisted-column-visibility.js";

export { selectionColumn } from "./data-table-selection.js";

export interface DataTableProps<TData> {
  /**
   * `local` applies search, sorting, and paging to the supplied rows.
   * `server` delegates those operations to the caller. `cursor` is server
   * data paged by cursor: pass `cursorPagination` for its footer.
   */
  mode?: "local" | "server" | "cursor";
  data: TData[];
  columns: ColumnDef<TData>[];
  rowCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  /** Set false when the visible columns have no searchable data accessor. */
  searchable?: boolean;
  isLoading?: boolean;
  emptyState?: ReactNode;
  /**
   * A failed load. Any truthy value replaces the rows with an error state
   * (title, a sentence, a retry button), so a failure never reads as "no
   * data". A string or element is shown as its description; an object with
   * a string `code` (an API error) adds a small support line. Pass the
   * query's `error` or `isError`.
   */
  error?: unknown;
  /** The error state's retry button, e.g. the query's `refetch`. */
  onRetry?: () => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  bulkActions?: ReactNode;
  /** The table's own actions ("Tambah"), at the end of the toolbar beside the search. */
  toolbarActions?: ReactNode;
  /**
   * `normal` (default) is a comfortable row: ~52px min height, `px-4 py-3`
   * cells, vertically centered content. `compact` keeps the tighter ~40px
   * row for a screen that genuinely relies on seeing more rows at once;
   * the toolbar's density toggle lets a reader switch either way.
   */
  density?: DataTableDensity;
  onDensityChange?: (density: DataTableDensity) => void;
  storageKey?: string;
  /** Opt-in in-memory state key. Defaults to `storageKey` when provided. */
  stateKey?: string;
  getRowId?: (row: TData) => string;
  /** Opens a row: a click anywhere on it (outside its own controls), Enter on the focused row, or a tap on its card. */
  onRowActivate?: (row: TData) => void;
  toolbarLabels?: Partial<DataTableToolbarLabels>;
  paginationLabels?: Partial<DataTablePaginationLabels>;
  /** Rendered in the toolbar next to the search box; see `DataTableFilters`. */
  filters?: DataTableFilterDef[];
  filtersLabels?: Partial<DataTableFiltersLabels>;
  /**
   * Desktop-only viewport-fit mode: the table's parent chain must pass
   * height down (`min-h-0` flex) for this to do anything. The card still
   * sizes to its own rows first; only once they would be taller than the
   * parent does the header stick and the body scroll inside the card, with
   * the pagination footer kept in view. Mobile keeps the card list and
   * normal document scroll.
   */
  fillHeight?: boolean;
  /**
   * `mode="local"`'s first page size, before any remembered `stateKey`
   * state exists. Defaults to 50. Lower it for a list whose rows render as
   * tall mobile cards (e.g. the library desk's overdue queue, 10).
   */
  defaultPageSize?: number;
  /**
   * Page sizes the footer offers (from `sm` up) while there is more than
   * one page. Local tables default to 10, 25, 50 and 100; a server table
   * shows the picker only when given these, since its caller refetches.
   */
  pageSizeOptions?: number[];
  /** `mode="cursor"`'s previous and next, rendered in the table's own footer. */
  cursorPagination?: DataTableCursorPagination;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE };
const LOCAL_PAGE_SIZES = [10, 25, 50, 100];

/** Column id to its rendered header, plus a plain label for columns the header groups skip. */
function collectHeaders<TData>(
  table: Table<TData>,
  remembered: Record<string, ReactNode>,
): Record<string, ReactNode> {
  // Rendered once from the header groups, because a header cell needs a
  // header context and a body cell cannot supply one.
  const headers: Record<string, ReactNode> = {};
  for (const headerGroup of table.getHeaderGroups()) {
    for (const header of headerGroup.headers) {
      if (header.isPlaceholder) continue;
      headers[header.column.id] = flexRender(header.column.columnDef.header, header.getContext());
    }
  }
  Object.assign(remembered, headers);
  for (const column of table.getAllFlatColumns()) {
    if (remembered[column.id] !== undefined) continue;
    const label = getDataTableColumnLabel(column.columnDef.meta, column.columnDef.header);
    if (label !== undefined) remembered[column.id] = label;
  }
  return headers;
}

/**
 * A TanStack table for local rows, offset-paginated server rows, and cursor
 * responses: a toolbar, the rows in a card on desktop and as cards on a
 * phone, one empty, error and loading treatment, and one pagination footer
 * for every mode. See docs/05-shared-components.md.
 */
export function DataTable<TData>({
  mode = "server",
  data,
  columns,
  rowCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  globalFilter,
  onGlobalFilterChange,
  searchable,
  isLoading,
  emptyState,
  error,
  onRetry,
  rowSelection,
  onRowSelectionChange,
  bulkActions,
  toolbarActions,
  density: densityProp,
  onDensityChange,
  storageKey,
  stateKey,
  getRowId,
  onRowActivate,
  toolbarLabels,
  paginationLabels,
  filters,
  filtersLabels,
  fillHeight,
  defaultPageSize,
  pageSizeOptions,
  cursorPagination,
}: DataTableProps<TData>) {
  const uiLabels = useUiLabels();
  const rememberedState = useDataTableState(
    mode === "local" ? (stateKey ?? storageKey) : undefined,
  );
  const [internalPagination, setInternalPagination] = useState<PaginationState>(
    () =>
      rememberedState.initialState?.pagination ?? {
        pageIndex: 0,
        pageSize: defaultPageSize ?? DEFAULT_PAGE_SIZE,
      },
  );
  const [internalSorting, setInternalSorting] = useState<SortingState>(
    () => rememberedState.initialState?.sorting ?? [],
  );
  const [internalGlobalFilter, setInternalGlobalFilter] = useState(
    () => rememberedState.initialState?.globalFilter ?? "",
  );
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [internalDensity, setInternalDensity] = useState<DataTableDensity>("normal");
  const density = densityProp ?? internalDensity;
  const setDensity = onDensityChange ?? setInternalDensity;
  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(storageKey);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const columnLabelsRef = useRef<Record<string, ReactNode>>({});

  const tablePagination =
    mode === "local" ? internalPagination : (pagination ?? DEFAULT_PAGINATION);
  const tableSorting = mode === "local" ? internalSorting : (sorting ?? []);
  const tableGlobalFilter = mode === "local" ? internalGlobalFilter : (globalFilter ?? "");
  const setPagination = mode === "local" ? setInternalPagination : onPaginationChange;
  const setSorting = mode === "local" ? setInternalSorting : onSortingChange;
  const hasSearch = searchable ?? (mode === "local" || onGlobalFilterChange !== undefined);
  useEffect(() => {
    if (mode !== "local") return;
    rememberedState.remember({
      pagination: internalPagination,
      sorting: internalSorting,
      globalFilter: internalGlobalFilter,
    });
  }, [internalGlobalFilter, internalPagination, internalSorting, mode, rememberedState]);
  const applyFilterChange = useCallback(
    (value: string) => {
      if (mode === "local") {
        setInternalGlobalFilter(value);
        setInternalPagination((current) => ({ ...current, pageIndex: 0 }));
        return;
      }
      onGlobalFilterChange?.(value);
      onPaginationChange?.((current) => ({ ...current, pageIndex: 0 }));
    },
    [mode, onGlobalFilterChange, onPaginationChange],
  );
  const debouncedFilterChange = useDebouncedCallback(applyFilterChange, 300);

  // Clearing is immediate, not debounced: the rows come back at once.
  const clearSearch = useCallback(() => {
    debouncedFilterChange("");
    applyFilterChange("");
  }, [applyFilterChange, debouncedFilterChange]);
  const clearLocalSearch = useCallback(() => {
    clearSearch();
    setSearchResetKey((key) => key + 1);
  }, [clearSearch]);

  const table = useReactTable({
    data,
    columns,
    rowCount,
    state: {
      pagination: tablePagination,
      sorting: tableSorting,
      globalFilter: tableGlobalFilter,
      rowSelection: rowSelection ?? {},
      columnVisibility,
    },
    manualPagination: mode !== "local",
    manualSorting: mode !== "local",
    manualFiltering: mode !== "local",
    autoResetPageIndex: false,
    enableRowSelection: !!onRowSelectionChange,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const filteredRowCount = table.getFilteredRowModel().rows.length;
  const lastLocalPageIndex = Math.max(
    0,
    Math.ceil(filteredRowCount / tablePagination.pageSize) - 1,
  );
  const clampLocalPage = useCallback((pageIndex: number) => {
    setInternalPagination((current) =>
      current.pageIndex > pageIndex ? { ...current, pageIndex } : current,
    );
  }, []);
  useEffect(() => {
    if (mode === "local" && !isLoading) clampLocalPage(lastLocalPageIndex);
  }, [clampLocalPage, isLoading, lastLocalPageIndex, mode]);

  const focusRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      setFocusedRowIndex(index);
      rowRefs.current.get(row.id)?.focus();
    },
    [rows],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableSectionElement>) => {
      if (!(event.target instanceof HTMLTableRowElement)) return;
      if (rows.length === 0) return;
      if (event.key === "j") {
        event.preventDefault();
        focusRow(Math.min(focusedRowIndex + 1, rows.length - 1));
      } else if (event.key === "k") {
        event.preventDefault();
        focusRow(Math.max(focusedRowIndex - 1, 0));
      } else if (event.key === "Enter") {
        const row = rows[focusedRowIndex];
        if (row) onRowActivate?.(row.original);
      }
    },
    [focusRow, focusedRowIndex, onRowActivate, rows],
  );

  const selectedCount = Object.values(rowSelection ?? {}).filter(Boolean).length;
  const skeletonRowCount = Math.min(tablePagination.pageSize, 8);
  const cardHeaders = collectHeaders(table, columnLabelsRef.current);

  const failed = Boolean(error) && !isLoading;
  const empty = !isLoading && !failed && rows.length === 0;
  const hasNoLocalSearchResults =
    mode === "local" &&
    tableGlobalFilter.trim() !== "" &&
    data.length > 0 &&
    filteredRowCount === 0;
  const toolbarCopy = toolbarLabelsFrom(uiLabels, toolbarLabels);
  const stateContent = failed ? (
    <DataTableErrorState error={error} onRetry={onRetry} />
  ) : empty ? (
    <DataTableEmptySlot>
      {hasNoLocalSearchResults ? (
        <DataTableSearchEmptyState
          title={toolbarCopy.noSearchResultsTitle}
          description={toolbarCopy.noSearchResultsDescription}
          clearLabel={toolbarCopy.clearSearch}
          onClear={clearLocalSearch}
        />
      ) : (
        emptyState
      )}
    </DataTableEmptySlot>
  ) : null;

  const showFooter = !isLoading && !failed && rows.length > 0;
  const footer = !showFooter ? null : mode === "cursor" ? (
    cursorPagination && <DataTableCursorFooter cursor={cursorPagination} shownRows={rows.length} />
  ) : (
    <DataTablePagination
      table={table}
      pageCount={
        mode === "local" ? Math.ceil(filteredRowCount / tablePagination.pageSize) : undefined
      }
      totalRows={mode === "local" ? filteredRowCount : rowCount}
      pageSizeOptions={pageSizeOptions ?? (mode === "local" ? LOCAL_PAGE_SIZES : undefined)}
      labels={paginationLabels}
    />
  );

  return (
    <div className={cn("flex flex-col gap-3", fillHeight && "md:h-full md:min-h-0")}>
      <DataTableToolbar
        key={searchResetKey}
        table={table}
        showSearch={hasSearch}
        searchValue={tableGlobalFilter}
        onSearchChange={debouncedFilterChange}
        onSearchClear={clearSearch}
        density={density}
        onDensityChange={setDensity}
        bulkActions={bulkActions}
        selectedCount={selectedCount}
        columnLabels={columnLabelsRef.current}
        labels={toolbarLabels}
        filters={filters}
        filtersLabels={filtersLabels}
        actions={toolbarActions}
      />
      {/*
        One frame for both layouts: from md up it is the table's card, with
        the footer inside it under a hairline; below md it is only a
        column, the rows render as cards (a table that only scrolls sideways
        on a phone hides the columns carrying the answer) and the footer
        follows them. The empty and error states carry their own card on a
        phone and sit flush inside the frame on desktop.
      */}
      <div
        data-slot="data-table"
        className={cn(
          "flex flex-col gap-1 md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-border md:bg-surface md:shadow-1",
          // No `flex-1`: the card sizes to its own rows first, growing no
          // taller than that; only content taller than the parent makes
          // `max-h-full` cap it, the header stick and the body scroll.
          fillHeight && "md:min-h-0 md:max-h-full",
        )}
      >
        {stateContent ? (
          <div className="rounded-lg border border-border bg-surface shadow-1 md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
            {stateContent}
          </div>
        ) : (
          <>
            <div className="md:hidden">
              <DataTableCards
                rows={rows}
                headers={cardHeaders}
                isLoading={isLoading}
                skeletonRowCount={skeletonRowCount}
                onRowActivate={onRowActivate}
                selectionEnabled={!!onRowSelectionChange}
                allRowsSelected={table.getIsAllRowsSelected()}
                someRowsSelected={table.getIsSomeRowsSelected()}
                onToggleAllRowsSelected={() => {
                  table.toggleAllRowsSelected();
                }}
              />
            </div>
            <div
              className={cn(
                "hidden overflow-x-auto md:block",
                fillHeight && "md:min-h-0 md:overflow-y-auto",
              )}
            >
              <table className="w-full border-collapse text-body-sm tabular-nums">
                <DataTableHead table={table} fillHeight={fillHeight} density={density} />
                <DataTableBody
                  rows={rows}
                  columnCount={columns.length}
                  density={density}
                  isLoading={isLoading}
                  skeletonRowCount={skeletonRowCount}
                  onRowActivate={onRowActivate}
                  focusedRowIndex={focusedRowIndex}
                  onFocusRow={setFocusedRowIndex}
                  rowRefs={rowRefs}
                  onKeyDown={handleKeyDown}
                />
              </table>
            </div>
          </>
        )}
        {footer && <div className="shrink-0 px-1 md:border-t md:border-line md:px-4">{footer}</div>}
      </div>
    </div>
  );
}
