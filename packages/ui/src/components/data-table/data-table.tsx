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
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "../../utils/cn.js";

import { DataTableCards } from "./data-table-cards.js";
import { DataTableSearchEmptyState } from "./data-table-empty-state.js";
import { DataTablePagination, type DataTablePaginationLabels } from "./data-table-pagination.js";
import { useDataTableState } from "./data-table-state.js";
import {
  DEFAULT_TOOLBAR_LABELS,
  DataTableToolbar,
  getDataTableColumnLabel,
  type DataTableToolbarLabels,
} from "./data-table-toolbar.js";
import { useDebouncedCallback } from "./use-debounced-callback.js";
import { usePersistedColumnVisibility } from "./use-persisted-column-visibility.js";

export { selectionColumn } from "./data-table-selection.js";

export interface DataTableProps<TData> {
  /**
   * `local` applies search, sorting, and paging to the supplied rows.
   * `server` delegates those operations to the caller. `cursor` is server
   * data with navigation supplied outside the table, so it has no page UI.
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
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  bulkActions?: ReactNode;
  density?: "normal" | "compact";
  onDensityChange?: (density: "normal" | "compact") => void;
  storageKey?: string;
  /** Opt-in in-memory state key. Defaults to `storageKey` when provided. */
  stateKey?: string;
  getRowId?: (row: TData) => string;
  onRowActivate?: (row: TData) => void;
  toolbarLabels?: Partial<DataTableToolbarLabels>;
  paginationLabels?: Partial<DataTablePaginationLabels>;
  /**
   * Desktop-only viewport-fit mode: the table fills its flex parent's height
   * and scrolls its rows internally under a sticky header, so the page around
   * it never scrolls. The parent chain must pass height down (`min-h-0`
   * flex). Mobile keeps the card list and normal document scroll.
   */
  fillHeight?: boolean;
  /**
   * `mode="local"`'s first page size, before any remembered `stateKey`
   * state exists. Defaults to 50, the size every screen used before this
   * prop existed. Lower it for a list whose rows render as tall mobile
   * cards rather than dense table rows -- 50 cards is a long scroll on a
   * phone even though 50 table rows on desktop is not (e.g. the library
   * circulation desk's overdue queue, docs/analysis/
   * ux-audit-2026-09-25.md finding 8, set to 10). Ignored outside
   * `mode="local"`: server/cursor pagination is the caller's own
   * `pagination` prop.
   */
  defaultPageSize?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE };

const ROW_HEIGHT = { normal: "h-10", compact: "h-8" } as const;

/**
 * A TanStack table for local rows, offset-paginated server rows, and cursor
 * responses. Server mode delegates data operations to the caller; cursor
 * navigation remains outside the table. See docs/05-shared-components.md.
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
  rowSelection,
  onRowSelectionChange,
  bulkActions,
  density: densityProp,
  onDensityChange,
  storageKey,
  stateKey,
  getRowId,
  onRowActivate,
  toolbarLabels,
  paginationLabels,
  fillHeight,
  defaultPageSize,
}: DataTableProps<TData>) {
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
  const [internalDensity, setInternalDensity] = useState<"normal" | "compact">("normal");
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
      if (mode === "local") setInternalGlobalFilter(value);
      if (mode !== "local") {
        onGlobalFilterChange?.(value);
        onPaginationChange?.((current) => ({ ...current, pageIndex: 0 }));
      }
      if (mode === "local") {
        setPagination?.((current) => ({ ...current, pageIndex: 0 }));
      }
    },
    [mode, onGlobalFilterChange, onPaginationChange, setPagination],
  );
  const debouncedFilterChange = useDebouncedCallback(applyFilterChange, 300);

  const clearLocalSearch = useCallback(() => {
    debouncedFilterChange("");
    applyFilterChange("");
    setSearchResetKey((key) => key + 1);
  }, [applyFilterChange, debouncedFilterChange]);

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
  const hasNoLocalSearchResults =
    mode === "local" &&
    tableGlobalFilter.trim() !== "" &&
    data.length > 0 &&
    filteredRowCount === 0;
  const toolbarCopy = { ...DEFAULT_TOOLBAR_LABELS, ...toolbarLabels };
  const localSearchEmptyState = (
    <DataTableSearchEmptyState
      title={toolbarCopy.noSearchResultsTitle}
      description={toolbarCopy.noSearchResultsDescription}
      clearLabel={toolbarCopy.clearSearch}
      onClear={clearLocalSearch}
    />
  );

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

  // Rendered once from the header groups, because a header cell needs a
  // header context and a body cell cannot supply one.
  const cardHeaders: Record<string, ReactNode> = {};
  for (const headerGroup of table.getHeaderGroups()) {
    for (const header of headerGroup.headers) {
      if (header.isPlaceholder) continue;
      cardHeaders[header.column.id] = flexRender(
        header.column.columnDef.header,
        header.getContext(),
      );
    }
  }
  for (const [id, label] of Object.entries(cardHeaders)) {
    columnLabelsRef.current[id] = label;
  }
  for (const column of table.getAllFlatColumns()) {
    if (columnLabelsRef.current[column.id] !== undefined) continue;
    const label = getDataTableColumnLabel(column.columnDef.meta, column.columnDef.header);
    if (label !== undefined) columnLabelsRef.current[column.id] = label;
  }

  return (
    <div className={cn("flex flex-col gap-3", fillHeight && "md:h-full md:min-h-0")}>
      <DataTableToolbar
        key={searchResetKey}
        table={table}
        showSearch={hasSearch}
        searchValue={tableGlobalFilter}
        onSearchChange={debouncedFilterChange}
        density={density}
        onDensityChange={setDensity}
        bulkActions={bulkActions}
        selectedCount={selectedCount}
        columnLabels={columnLabelsRef.current}
        labels={toolbarLabels}
      />
      {/*
        Below md the same rows render as cards: a table that only scrolls
        sideways on a phone hides the columns carrying the answer, with
        nothing on screen to say they exist.
      */}
      <div className="md:hidden">
        <DataTableCards
          rows={rows}
          headers={cardHeaders}
          isLoading={isLoading}
          skeletonRowCount={skeletonRowCount}
          emptyState={hasNoLocalSearchResults ? localSearchEmptyState : emptyState}
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
          "hidden overflow-x-auto rounded-sm border border-border md:block",
          fillHeight && "md:min-h-0 md:flex-1 md:overflow-y-auto",
        )}
      >
        <table className="w-full border-collapse text-[13px] tabular-nums">
          {/*
            With collapsed borders a sticky header's border-b does not stick,
            so the separator rides along as a shadow on the header itself.
          */}
          <thead
            className={cn(fillHeight && "sticky top-0 z-10 shadow-[0_1px_0_0_var(--color-border)]")}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-bg">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 text-left text-[12px] font-medium text-fg-muted"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 py-2 hover:text-fg"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon direction={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      <span className="block py-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- rows use roving focus for j/k/Enter activation. */}
          <tbody onKeyDown={handleKeyDown}>
            {isLoading ? (
              // The pulse animates once per row (not per cell): one running
              // animation per skeleton row instead of one per cell keeps the
              // same look with far fewer concurrent animations on wide
              // tables. See docs/16-audit-performa-web.md "Temuan menengah".
              Array.from({ length: skeletonRowCount }).map((_, index) => (
                <tr
                  key={index}
                  className={cn("animate-pulse border-b border-border", ROW_HEIGHT[density])}
                >
                  {columns.map((_column, columnIndex) => (
                    <td key={columnIndex} className="px-3">
                      <div
                        role="presentation"
                        className="h-4 w-full max-w-40 rounded-xs bg-border/60"
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {hasNoLocalSearchResults ? localSearchEmptyState : emptyState}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  ref={(element) => {
                    if (element) rowRefs.current.set(row.id, element);
                    else rowRefs.current.delete(row.id);
                  }}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  data-focused={rowIndex === focusedRowIndex ? "true" : undefined}
                  tabIndex={onRowActivate ? (rowIndex === focusedRowIndex ? 0 : -1) : undefined}
                  onFocus={() => {
                    setFocusedRowIndex(rowIndex);
                  }}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    ROW_HEIGHT[density],
                    "data-[focused=true]:bg-bg",
                    "data-[state=selected]:bg-accent/10",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {mode !== "cursor" && !isLoading && rows.length > 0 && (
        <DataTablePagination
          table={table}
          pageCount={
            mode === "local"
              ? Math.ceil(table.getFilteredRowModel().rows.length / tablePagination.pageSize)
              : undefined
          }
          labels={paginationLabels}
        />
      )}
    </div>
  );
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ArrowUp className="size-3.5" aria-hidden="true" />;
  if (direction === "desc") return <ArrowDown className="size-3.5" aria-hidden="true" />;
  return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />;
}
