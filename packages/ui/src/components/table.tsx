"use client";

import { createContext, useContext, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

export type TableDensity = "normal" | "compact";

const TableDensityContext = createContext<TableDensity>("normal");

type TableSection = "header" | "body" | "footer" | undefined;
const TableSectionContext = createContext<TableSection>(undefined);

// Mirrors data-table-body.tsx and data-table-head.tsx: `normal` is the
// comfortable ~52px row with `px-4 py-3` cells, `compact` the tighter row.
const CELL_PADDING: Record<TableDensity, string> = {
  normal: "px-4 py-3",
  compact: "px-3 py-2",
};
const HEAD_PADDING: Record<TableDensity, string> = {
  normal: "px-4",
  compact: "px-3",
};
const ROW_MIN_HEIGHT: Record<TableDensity, string> = {
  normal: "min-h-[52px]",
  compact: "min-h-10",
};

export interface TableProps extends ComponentPropsWithoutRef<"table"> {
  /**
   * `normal` (default) matches `DataTable`'s comfortable density. `compact`
   * keeps the tighter spacing every hand-rolled table used before -- pick
   * it only for a table that genuinely relies on seeing more rows at once
   * (e.g. an editable grid), and say so where it's used.
   */
  density?: TableDensity;
  /** className for the rounded, scrollable card wrapping the table. */
  containerClassName?: string;
}

/**
 * The shared HTML table primitive: the same card, header band, rows and
 * cells as `DataTable`'s desktop table, for a table that needs none of its
 * search, paging or phone cards (a grade sheet, a report). See
 * docs/05-shared-components.md.
 */
export function Table({ density = "normal", className, containerClassName, ...props }: TableProps) {
  return (
    <TableDensityContext.Provider value={density}>
      <div
        className={cn(
          "overflow-x-auto rounded-lg border border-border bg-surface shadow-1",
          containerClassName,
        )}
      >
        <table
          className={cn("w-full border-collapse text-body-sm tabular-nums", className)}
          {...props}
        />
      </div>
    </TableDensityContext.Provider>
  );
}

export function TableHeader({ className, ...props }: ComponentPropsWithoutRef<"thead">) {
  return (
    <TableSectionContext.Provider value="header">
      <thead className={className} {...props} />
    </TableSectionContext.Provider>
  );
}

export function TableBody({ className, ...props }: ComponentPropsWithoutRef<"tbody">) {
  return (
    <TableSectionContext.Provider value="body">
      <tbody className={className} {...props} />
    </TableSectionContext.Provider>
  );
}

/** A totals row band under the body, on the header's sunken tint. */
export function TableFooter({ className, ...props }: ComponentPropsWithoutRef<"tfoot">) {
  return (
    <TableSectionContext.Provider value="footer">
      <tfoot className={cn("bg-surface-sunken font-semibold", className)} {...props} />
    </TableSectionContext.Provider>
  );
}

export function TableRow({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  const density = useContext(TableDensityContext);
  const section = useContext(TableSectionContext);
  return (
    <tr
      className={cn(
        section === "header"
          ? "bg-surface-sunken"
          : section === "footer"
            ? cn(ROW_MIN_HEIGHT[density], "border-t border-line")
            : cn(
                ROW_MIN_HEIGHT[density],
                "border-b border-line last:border-b-0 transition-colors hover:bg-state-hover",
                "data-[state=selected]:bg-state-selected",
              ),
        className,
      )}
      {...props}
    />
  );
}

/**
 * A header cell. In `TableHeader` it is a column header on the sunken band:
 * caption-size muted label, at least 40px tall (`h-10` is a minimum in a
 * table), with its own vertical padding so a header of several lines (a
 * code over its weight) does not touch the card's edge. In `TableBody` and
 * `TableFooter` it heads its row (a student's name, "Total"): the cell's
 * padding, wrapping like a cell, `scope="row"`. A caller's `scope` wins.
 */
export function TableHead({ className, ...props }: ComponentPropsWithoutRef<"th">) {
  const density = useContext(TableDensityContext);
  const section = useContext(TableSectionContext);
  if (section === "body" || section === "footer") {
    return (
      <th
        scope="row"
        className={cn(
          CELL_PADDING[density],
          "text-left align-middle font-medium text-fg",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <th
      scope="col"
      className={cn(
        HEAD_PADDING[density],
        // The header's separator is drawn inside each cell, as in DataTable,
        // so it stays put under a sticky header.
        "h-10 py-2 text-left align-middle text-caption font-semibold whitespace-nowrap text-fg-muted",
        "shadow-[inset_0_-1px_0_var(--color-line)]",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentPropsWithoutRef<"td">) {
  const density = useContext(TableDensityContext);
  return <td className={cn(CELL_PADDING[density], "align-middle", className)} {...props} />;
}

export function TableCaption({ className, ...props }: ComponentPropsWithoutRef<"caption">) {
  return (
    <caption
      className={cn("caption-bottom py-3 text-body-sm text-fg-muted", className)}
      {...props}
    />
  );
}
