import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import { Checkbox } from "../checkbox.js";
import { Skeleton } from "../skeleton.js";

import { DataTableCards } from "./data-table-cards.js";
import { DataTablePagination, type DataTablePaginationLabels } from "./data-table-pagination.js";
import { DataTableToolbar, type DataTableToolbarLabels } from "./data-table-toolbar.js";
import { useDebouncedCallback } from "./use-debounced-callback.js";
import { usePersistedColumnVisibility } from "./use-persisted-column-visibility.js";

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  rowCount: number;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  isLoading?: boolean;
  emptyState?: ReactNode;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  bulkActions?: ReactNode;
  density?: "normal" | "compact";
  onDensityChange?: (density: "normal" | "compact") => void;
  storageKey?: string;
  getRowId?: (row: TData) => string;
  onRowActivate?: (row: TData) => void;
  toolbarLabels?: Partial<DataTableToolbarLabels>;
  paginationLabels?: Partial<DataTablePaginationLabels>;
}

const ROW_HEIGHT = { normal: "h-10", compact: "h-8" } as const;

/**
 * Server-side DataTable (TanStack Table): the caller owns sorting, paging,
 * filtering, and selection state and fetches accordingly. See
 * docs/05-shared-components.md section 3.
 */
export function DataTable<TData>({
  data,
  columns,
  rowCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  globalFilter,
  onGlobalFilterChange,
  isLoading,
  emptyState,
  rowSelection,
  onRowSelectionChange,
  bulkActions,
  density: densityProp,
  onDensityChange,
  storageKey,
  getRowId,
  onRowActivate,
  toolbarLabels,
  paginationLabels,
}: DataTableProps<TData>) {
  const [internalDensity, setInternalDensity] = useState<"normal" | "compact">("normal");
  const density = densityProp ?? internalDensity;
  const setDensity = onDensityChange ?? setInternalDensity;
  const [columnVisibility, setColumnVisibility] = usePersistedColumnVisibility(storageKey);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const debouncedFilterChange = useDebouncedCallback(onGlobalFilterChange, 300);

  const table = useReactTable({
    data,
    columns,
    rowCount,
    state: {
      pagination,
      sorting,
      globalFilter,
      rowSelection: rowSelection ?? {},
      columnVisibility,
    },
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: !!onRowSelectionChange,
    onPaginationChange,
    onSortingChange,
    onRowSelectionChange,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableSectionElement>) => {
      if (rows.length === 0) return;
      if (event.key === "j") {
        event.preventDefault();
        setFocusedRowIndex((index) => Math.min(index + 1, rows.length - 1));
      } else if (event.key === "k") {
        event.preventDefault();
        setFocusedRowIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        const row = rows[focusedRowIndex];
        if (row) onRowActivate?.(row.original);
      }
    },
    [rows, focusedRowIndex, onRowActivate],
  );

  const selectedCount = Object.keys(rowSelection ?? {}).length;
  const skeletonRowCount = Math.min(pagination.pageSize, 8);

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

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar
        table={table}
        searchValue={globalFilter}
        onSearchChange={debouncedFilterChange}
        density={density}
        onDensityChange={setDensity}
        bulkActions={bulkActions}
        selectedCount={selectedCount}
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
          emptyState={emptyState}
          onRowActivate={onRowActivate}
        />
      </div>
      <div className="hidden overflow-x-auto rounded-sm border border-border md:block">
        <table className="w-full border-collapse text-[13px] tabular-nums">
          <thead>
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
          {/*
            eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions --
            intentional: `tbody` is the keyboard-navigable surface for the table's own j/k/Enter
            row navigation (docs/05-shared-components.md), the same pattern as a custom grid widget.
          */}
          <tbody ref={bodyRef} tabIndex={0} onKeyDown={handleKeyDown} className="outline-none">
            {isLoading ? (
              Array.from({ length: skeletonRowCount }).map((_, index) => (
                <tr key={index} className={cn("border-b border-border", ROW_HEIGHT[density])}>
                  {columns.map((_column, columnIndex) => (
                    <td key={columnIndex} className="px-3">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {emptyState}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    ROW_HEIGHT[density],
                    rowIndex === focusedRowIndex && "bg-bg",
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
      {!isLoading && rows.length > 0 && (
        <DataTablePagination table={table} rowCount={rowCount} labels={paginationLabels} />
      )}
    </div>
  );
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ArrowUp className="size-3.5" aria-hidden="true" />;
  if (direction === "desc") return <ArrowDown className="size-3.5" aria-hidden="true" />;
  return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />;
}

/** Selection column helper: `columns: [selectionColumn(), ...yourColumns]`. */
export function selectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    size: 40,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => {
          table.toggleAllRowsSelected(!!value);
        }}
        aria-label="Pilih semua baris"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => {
          row.toggleSelected(!!value);
        }}
        aria-label="Pilih baris"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  };
}
