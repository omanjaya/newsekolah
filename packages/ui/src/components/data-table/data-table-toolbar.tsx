"use client";

import { flexRender, type Column, type Table } from "@tanstack/react-table";
import { Columns3, Ellipsis, Rows3, X } from "lucide-react";
import { useState, type ReactElement, type ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../dropdown-menu.js";
import { IconButton } from "../icon-button.js";
import { SearchInput } from "../search-input.js";
import { useUiLabels, type UiLabels } from "../ui-labels.js";

import { isListedInColumnMenu } from "./column-meta.js";
import {
  DataTableFilters,
  isFilterActive,
  type DataTableFilterDef,
  type DataTableFiltersLabels,
} from "./data-table-filters.js";

export interface DataTableToolbarLabels {
  searchPlaceholder: string;
  columns: string;
  density: string;
  densityNormal: string;
  densityCompact: string;
  noSearchResultsTitle: string;
  noSearchResultsDescription: string;
  clearSearch: string;
}

/** The toolbar's labels: the caller's overrides on top of the provider's `UiLabels`. */
export function toolbarLabelsFrom(
  uiLabels: UiLabels,
  overrides?: Partial<DataTableToolbarLabels>,
): DataTableToolbarLabels {
  return {
    searchPlaceholder: uiLabels.tableSearchPlaceholder,
    columns: uiLabels.tableColumns,
    density: uiLabels.tableDensity,
    densityNormal: uiLabels.tableDensityNormal,
    densityCompact: uiLabels.tableDensityCompact,
    noSearchResultsTitle: uiLabels.tableNoResultsTitle,
    noSearchResultsDescription: uiLabels.tableNoResultsDescription,
    clearSearch: uiLabels.tableClearSearch,
    ...overrides,
  };
}

export function getDataTableColumnLabel(
  meta: unknown,
  header: unknown,
): string | number | undefined {
  if (meta && typeof meta === "object" && "label" in meta) {
    const label = (meta as { label?: unknown }).label;
    if (typeof label === "string" || typeof label === "number") return label;
  }
  return typeof header === "string" || typeof header === "number" ? header : undefined;
}

/**
 * Column id to its rendered header (the phone cards' field labels), and
 * into `remembered` a plain label for columns the header groups skip (the
 * column menu's names).
 */
export function collectColumnHeaders<TData>(
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

export interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  showSearch: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** The search box's clear button and Escape: applied at once, past the typing debounce. */
  onSearchClear?: () => void;
  density: "normal" | "compact";
  onDensityChange: (density: "normal" | "compact") => void;
  bulkActions?: ReactNode;
  selectedCount: number;
  columnLabels: Record<string, ReactNode>;
  labels?: Partial<DataTableToolbarLabels>;
  /** Rendered next to the search box, front page-level filters through `DataTableFilters`. */
  filters?: DataTableFilterDef[];
  filtersLabels?: Partial<DataTableFiltersLabels>;
  /** The table's own actions ("Tambah"), at the toolbar's end, level with the search box. */
  actions?: ReactNode;
  /**
   * The density and column controls. Default true; false leaves them out
   * for a short, fixed list where neither choice means anything.
   */
  viewOptions?: boolean;
  /**
   * Whether the table shows (or is loading) any rows. Default true. With
   * no rows, no search and no active filter there is nothing to arrange,
   * so the view controls stay out.
   */
  hasRows?: boolean;
}

/** 44px wherever the pointer is coarse, 32 with a cursor: the toolbar's one control height. */
const TOOLBAR_ICON = "md:size-11 md:pointer-fine:size-8";

/** A column menu with one entry only hides the table's one column: it needs two to be a choice. */
const MIN_MENU_COLUMNS = 2;

function hideableColumns<TData>(
  table: Table<TData>,
  columnLabels: Record<string, ReactNode>,
): Column<TData>[] {
  return table
    .getAllLeafColumns()
    .filter(
      (column) =>
        column.getCanHide() &&
        isListedInColumnMenu(column) &&
        columnLabels[column.id] !== undefined,
    );
}

function ColumnItems<TData>({
  columns,
  columnLabels,
}: {
  columns: Column<TData>[];
  columnLabels: Record<string, ReactNode>;
}): ReactElement {
  return (
    <>
      {columns.map((column) => (
        <DropdownMenuCheckboxItem
          key={column.id}
          checked={column.getIsVisible()}
          onCheckedChange={(value) => {
            column.toggleVisibility(value);
          }}
          onSelect={(event) => {
            event.preventDefault();
          }}
        >
          {columnLabels[column.id]}
        </DropdownMenuCheckboxItem>
      ))}
    </>
  );
}

/**
 * Search, filter pills, the table's own actions and its view options.
 * From `md` up it is one row in that order (pills wrap if they must),
 * density and columns as separate icons at the end. On a phone the
 * table's own actions take the first row, each an equal share of it; the
 * search box takes the next beside one overflow menu (the columns); the
 * pills scroll sideways on a row of their own, so the first card is never
 * pushed below the fold by wrapped pills. The DOM keeps the desktop order,
 * which is where keyboards and Tab are, and the phone rows are arranged
 * with `order`. A control with nothing to act on is left out (the view
 * options over an empty, unfiltered table; the overflow menu without a
 * search box to sit beside), and a toolbar left with nothing at a width
 * is hidden at that width.
 */
export function DataTableToolbar<TData>({
  table,
  showSearch,
  searchValue,
  onSearchChange,
  onSearchClear,
  density,
  onDensityChange,
  bulkActions,
  selectedCount,
  columnLabels,
  labels: labelsOverride,
  filters,
  filtersLabels,
  actions,
  viewOptions = true,
  hasRows = true,
}: DataTableToolbarProps<TData>): ReactElement | null {
  const uiLabels = useUiLabels();
  const labels = toolbarLabelsFrom(uiLabels, labelsOverride);
  const [localSearch, setLocalSearch] = useState(searchValue);
  const columns = hideableColumns(table, columnLabels);
  const hasFilters = filters !== undefined && filters.length > 0;
  // Density and columns arrange rows: over an empty table that no search or
  // filter emptied, they are two icons with nothing to act on.
  const narrowed = searchValue.trim() !== "" || (filters ?? []).some(isFilterActive);
  const showViewOptions = viewOptions && (hasRows || narrowed);
  const showColumns = showViewOptions && columns.length >= MIN_MENU_COLUMNS;
  // The phone's column menu sits beside the search box; without one it
  // would wrap onto a row of its own, a lone "..." above the pills.
  const showPhoneColumns = showColumns && showSearch;

  if (selectedCount > 0 && bulkActions) {
    return (
      <div className="flex min-h-13 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-accent-soft py-1 pr-1 pl-4 text-accent-soft-fg md:pointer-fine:min-h-10">
        <span className="text-label">{uiLabels.tableSelectedRows(selectedCount)}</span>
        <div className="flex items-center gap-2">
          {bulkActions}
          <IconButton
            icon={<X />}
            aria-label={uiLabels.tableClearSelection}
            className={cn(TOOLBAR_ICON, "text-accent-soft-fg")}
            onClick={() => {
              table.resetRowSelection();
            }}
          />
        </div>
      </div>
    );
  }

  const densityLabel = `${labels.density}: ${density === "compact" ? labels.densityCompact : labels.densityNormal}`;
  // Density is desktop-only (cards have none), and the phone's column menu
  // needs the search box: a table with no search, filters or actions
  // (lesson periods) has no phone toolbar at all; its view options stay
  // from md up. A toolbar with nothing at either width is not drawn.
  const emptyOnPhone = !showSearch && !hasFilters && actions === undefined;
  if (emptyOnPhone && !showViewOptions) return null;
  return (
    <div
      data-slot="data-table-toolbar"
      className={cn(
        // As tall as the selection bar that replaces it, so ticking a row never moves the table.
        // Top-aligned from md up: every control there is one height, and
        // pills that wrap to a second row hang below the first instead of
        // pulling the search box and the actions down to their middle.
        "flex flex-wrap items-center gap-2 md:items-start md:pointer-fine:min-h-10",
        emptyOnPhone && "max-md:hidden",
      )}
    >
      {showSearch && (
        <SearchInput
          size="sm"
          value={localSearch}
          onChange={(event) => {
            setLocalSearch(event.target.value);
            onSearchChange(event.target.value);
          }}
          onClear={onSearchClear}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="order-1 min-w-0 flex-1 basis-0 md:w-72 md:flex-none md:basis-auto lg:w-80"
        />
      )}
      {/* From md up the pills take the room the search box, the actions and
          the view icons leave (basis 0, at least 12rem) and wrap inside it,
          so a long set of pills never pushes the actions or the icons onto
          a row of their own. Below md the row scrolls sideways and runs out
          into the 16px page gutter on both sides (32px wider than the
          column, its first pill where it was), so the next pill peeks in
          from the screen's edge instead of ending flush with the column. */}
      {hasFilters && (
        <DataTableFilters
          filters={filters}
          labels={filtersLabels}
          className={cn(
            "order-4 basis-full md:order-2 md:min-w-48 md:flex-1 md:basis-0",
            "max-md:-mx-4 max-md:basis-[calc(100%+2rem)] max-md:scroll-px-4 max-md:px-4",
          )}
        />
      )}
      {/* On a phone the table's own actions take the first row, each an equal
          share of it, so the search row below holds only the box and the
          overflow menu. */}
      {actions !== undefined && (
        <div className="order-0 flex basis-full items-center gap-2 [&>*]:flex-1 md:order-3 md:ml-auto md:basis-auto md:[&>*]:flex-none">
          {actions}
        </div>
      )}
      {showViewOptions && (
        <div
          className={cn(
            "order-2 ml-auto flex shrink-0 items-center gap-1 md:order-4",
            // Below md only the column menu lives here, beside the search box.
            !showPhoneColumns && "max-md:hidden",
            actions !== undefined && "md:ml-0",
          )}
        >
          <IconButton
            icon={<Rows3 />}
            aria-label={densityLabel}
            aria-pressed={density === "compact"}
            onClick={() => {
              onDensityChange(density === "compact" ? "normal" : "compact");
            }}
            className={cn(
              "hidden md:inline-flex",
              TOOLBAR_ICON,
              density === "compact" && "bg-state-selected text-accent",
            )}
          />
          {showColumns && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={<Columns3 />}
                  aria-label={labels.columns}
                  className={cn("hidden md:inline-flex", TOOLBAR_ICON)}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <ColumnItems columns={columns} columnLabels={columnLabels} />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {showPhoneColumns && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={<Ellipsis />}
                  aria-label={uiLabels.tableMoreOptions}
                  className="md:hidden"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{labels.columns}</DropdownMenuLabel>
                <ColumnItems columns={columns} columnLabels={columnLabels} />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
