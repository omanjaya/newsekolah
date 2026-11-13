import type { Header, Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../../utils/cn.js";

import { columnAlign, isActionsColumn } from "./column-meta.js";

// Horizontal padding only, matching `CELL_PADDING` in data-table.tsx's own
// horizontal value for the same density -- header and body cells share a
// left edge, so the header can't pick its own padding independently.
// Vertical spacing stays with the sortable button/span below instead of
// this cell, unlike the body: that avoids stacking two vertical paddings
// in `normal` density, where the body cell has one of its own.
export const HEADER_CELL_PADDING = { normal: "px-4", compact: "px-3" } as const;

export interface DataTableHeadProps<TData> {
  table: Table<TData>;
  /** Sticks the header to the top of the scrolling body; see `DataTable`'s own `fillHeight` prop. */
  fillHeight?: boolean;
  density: "normal" | "compact";
}

/** A column's width from its definition; the 150px TanStack default means "let the table decide". */
export function columnWidth<TData>(header: Header<TData, unknown>): number | undefined {
  return header.getSize() !== 150 ? header.getSize() : undefined;
}

/**
 * The desktop table's `<thead>`: a quiet sunken band with caption-size
 * muted labels, one sort button per sortable column. An actions column
 * keeps its header for assistive tech only and hugs its buttons on the
 * right. Split out of `data-table.tsx` to keep that file under the
 * project's 400-line ceiling (docs/04-clean-code.md).
 */
export function DataTableHead<TData>({
  table,
  fillHeight,
  density,
}: DataTableHeadProps<TData>): ReactElement {
  return (
    <thead className={cn(fillHeight && "sticky top-0 z-10")}>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id} className="bg-surface-sunken">
          {headerGroup.headers.map((header) => {
            const end = columnAlign(header.column) === "end";
            const actions = isActionsColumn(header.column);
            const content = flexRender(header.column.columnDef.header, header.getContext());
            return (
              <th
                key={header.id}
                scope="col"
                aria-sort={
                  header.column.getCanSort() ? ariaSort(header.column.getIsSorted()) : undefined
                }
                className={cn(
                  HEADER_CELL_PADDING[density],
                  // The separator under the header is drawn once, inside each
                  // cell: with collapsed borders a row's border-b does not
                  // stick with a sticky header, and drawing both a border and
                  // a shadow left a 2px rule.
                  "h-10 shadow-[inset_0_-1px_0_var(--color-line)]",
                  "text-caption font-semibold whitespace-nowrap text-fg-muted",
                  end ? "text-right" : "text-left",
                  actions && "w-px",
                )}
                style={{ width: columnWidth(header) }}
              >
                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                  <button
                    type="button"
                    className={cn(
                      "-mx-1.5 inline-flex h-7 items-center gap-1 rounded-sm px-1.5 transition-colors",
                      "hover:bg-state-hover hover:text-fg",
                      header.column.getIsSorted() && "text-fg",
                      end && "flex-row-reverse",
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {content}
                    <SortIcon direction={header.column.getIsSorted()} />
                  </button>
                ) : (
                  <span className={cn("block", actions && "sr-only")}>{content}</span>
                )}
              </th>
            );
          })}
        </tr>
      ))}
    </thead>
  );
}

/** What `aria-sort` should announce for a sortable column's current direction. */
function ariaSort(direction: false | "asc" | "desc"): "ascending" | "descending" | "none" {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }): ReactElement {
  if (direction === "asc") return <ArrowUp className="size-3.5 text-accent" aria-hidden="true" />;
  if (direction === "desc")
    return <ArrowDown className="size-3.5 text-accent" aria-hidden="true" />;
  return <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />;
}
