import type { Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../../utils/cn.js";

// Horizontal padding only, matching `CELL_PADDING` in data-table.tsx's own
// horizontal value for the same density -- header and body cells share a
// left edge, so the header can't pick its own padding independently.
// Vertical spacing stays with the sortable button/span below instead of
// this cell, unlike the body: that avoids stacking two vertical paddings
// in `normal` density, where the body cell has one of its own.
const HEADER_CELL_PADDING = { normal: "px-4", compact: "px-3" } as const;

export interface DataTableHeadProps<TData> {
  table: Table<TData>;
  /** Sticks the header to the top of the scrolling body; see `DataTable`'s own `fillHeight` prop. */
  fillHeight?: boolean;
  density: "normal" | "compact";
}

/**
 * The desktop table's `<thead>`: a soft `bg-bg` row with slightly stronger
 * (semibold) label text than the body, one sortable button per sortable
 * column. Split out of `data-table.tsx` to keep that file under the
 * project's 400-line ceiling (docs/04-clean-code.md); it has no state of
 * its own, so there is nothing else to split it on.
 */
export function DataTableHead<TData>({
  table,
  fillHeight,
  density,
}: DataTableHeadProps<TData>): ReactElement {
  return (
    <thead className={cn(fillHeight && "sticky top-0 z-10 shadow-[0_1px_0_0_var(--color-line)]")}>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id} className="border-b border-line bg-bg">
          {headerGroup.headers.map((header) => (
            <th
              key={header.id}
              className={cn(
                HEADER_CELL_PADDING[density],
                "text-left text-[12px] font-semibold text-fg-muted",
              )}
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
  );
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }): ReactElement {
  if (direction === "asc") return <ArrowUp className="size-3.5" aria-hidden="true" />;
  if (direction === "desc") return <ArrowDown className="size-3.5" aria-hidden="true" />;
  return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />;
}
