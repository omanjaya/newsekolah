import { createContext, useContext, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

export type TableDensity = "normal" | "compact";

const TableDensityContext = createContext<TableDensity>("normal");

type TableSection = "header" | "body" | undefined;
const TableSectionContext = createContext<TableSection>(undefined);

// Mirrors `packages/ui/src/components/data-table/data-table.tsx` +
// `data-table-head.tsx`: `normal` is the comfortable ~52px row with
// `px-4 py-3` cells, `compact` is the tighter row every hand-rolled table
// used before this primitive existed.
const CELL_PADDING: Record<TableDensity, string> = {
  normal: "px-4 py-3",
  compact: "px-3 py-2",
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
 * The shared HTML table primitive: a rounded, horizontally scrollable card
 * (`Table`) around `thead`/`tbody`/`tr`/`th`/`td`/`caption` wrappers that
 * apply `DataTable`'s spacing so every hand-rolled table reads the same as
 * the TanStack-backed one. See docs/05-shared-components.md.
 */
export function Table({ density = "normal", className, containerClassName, ...props }: TableProps) {
  return (
    <TableDensityContext.Provider value={density}>
      <div
        className={cn(
          "overflow-x-auto rounded-lg border border-border bg-surface",
          containerClassName,
        )}
      >
        <table
          className={cn("w-full border-collapse text-[13px] tabular-nums", className)}
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

export function TableRow({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  const density = useContext(TableDensityContext);
  const section = useContext(TableSectionContext);
  return (
    <tr
      className={cn(
        "border-b border-line",
        section === "header" ? "bg-bg" : cn(ROW_MIN_HEIGHT[density], "last:border-b-0 hover:bg-bg"),
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentPropsWithoutRef<"th">) {
  const density = useContext(TableDensityContext);
  return (
    <th
      className={cn(
        CELL_PADDING[density],
        "text-left align-middle text-[12px] font-semibold text-fg-muted",
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
  return <caption className={cn("mt-3 text-[13px] text-fg-muted", className)} {...props} />;
}
