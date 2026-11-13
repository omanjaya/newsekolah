import { flexRender, type Row } from "@tanstack/react-table";
import type { KeyboardEvent, MouseEvent, ReactElement, RefObject } from "react";

import { cn } from "../../utils/cn.js";

import { columnAlign, isActionsColumn } from "./column-meta.js";

// `normal`'s row is a min-height, not a fixed one, so a cell that wraps (a
// long title, a multi-line badge stack) still grows the row instead of
// clipping it. `compact` keeps the exact row and cell padding every screen
// had before `normal` became this roomy, for a table that deliberately
// trades comfort for seeing more rows at once.
export const ROW_HEIGHT = { normal: "min-h-[52px]", compact: "h-10" } as const;
export const CELL_PADDING = { normal: "px-4 py-3", compact: "px-3" } as const;

export type DataTableDensity = keyof typeof ROW_HEIGHT;

/** A press on one of these inside a row is the control's own, not the row's. */
const ROW_CONTROL_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "[role=checkbox]",
  "[role=menuitem]",
  "[role=menuitemcheckbox]",
  "[role=menuitemradio]",
  "[role=option]",
  "[role=switch]",
  "[role=tab]",
  "[data-row-control]",
].join(", ");

export interface DataTableBodyProps<TData> {
  rows: Row<TData>[];
  columnCount: number;
  density: DataTableDensity;
  isLoading?: boolean;
  skeletonRowCount: number;
  onRowActivate?: (row: TData) => void;
  focusedRowIndex: number;
  onFocusRow: (index: number) => void;
  rowRefs: RefObject<Map<string, HTMLTableRowElement>>;
  onKeyDown: (event: KeyboardEvent<HTMLTableSectionElement>) => void;
}

/**
 * The desktop `<tbody>`: skeleton rows while loading, then the rows with
 * a hover layer, the selected tint and, when `onRowActivate` is set, a
 * pointer cursor, a click that opens the row and roving focus for j/k and
 * Enter.
 */
export function DataTableBody<TData>({
  rows,
  columnCount,
  density,
  isLoading,
  skeletonRowCount,
  onRowActivate,
  focusedRowIndex,
  onFocusRow,
  rowRefs,
  onKeyDown,
}: DataTableBodyProps<TData>): ReactElement {
  if (isLoading) {
    return (
      <tbody>
        {/* Each placeholder's highlight slides with `transform`, which the
            compositor runs without a repaint per frame, so a wide table's
            dozens of cells cost the main thread nothing. */}
        {Array.from({ length: skeletonRowCount }).map((_, index) => (
          <tr
            key={index}
            className={cn("border-b border-line last:border-b-0", ROW_HEIGHT[density])}
          >
            {Array.from({ length: columnCount }).map((_column, columnIndex) => (
              <td key={columnIndex} className={cn(CELL_PADDING[density], "align-middle")}>
                <div
                  role="presentation"
                  data-slot="skeleton"
                  className={cn(
                    "skeleton h-3.5 rounded-xs",
                    columnIndex === 0 ? "w-3/4 max-w-48" : "w-1/2 max-w-28",
                  )}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  }

  const activateFromClick = (event: MouseEvent<HTMLTableRowElement>, row: Row<TData>) => {
    if (!onRowActivate) return;
    // React bubbles a click through portals, so one inside a menu, dialog
    // or popover opened from a cell reaches this row too; only a click on
    // the row's own DOM opens it.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest(ROW_CONTROL_SELECTOR)) return;
    // Selecting text in a cell is reading, not opening the row.
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
    onRowActivate(row.original);
  };

  return (
    // Rows fade in (120ms) as they replace the skeleton.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- rows use roving focus for j/k/Enter activation.
    <tbody onKeyDown={onKeyDown} className="animate-fade-in">
      {rows.map((row, rowIndex) => (
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
            onFocusRow(rowIndex);
          }}
          onClick={(event) => {
            activateFromClick(event, row);
          }}
          className={cn(
            "border-b border-line last:border-b-0",
            ROW_HEIGHT[density],
            onRowActivate && "cursor-pointer active:bg-state-pressed",
            // The roving-focus row is only tinted while it actually has
            // keyboard focus; `data-focused` alone marks the first row of
            // every table, focused or not.
            "transition-colors hover:bg-state-hover",
            "focus-visible:bg-state-hover focus-visible:-outline-offset-2",
            "data-[state=selected]:bg-state-selected",
          )}
        >
          {row.getVisibleCells().map((cell) => (
            <td
              key={cell.id}
              className={cn(
                CELL_PADDING[density],
                "align-middle",
                columnAlign(cell.column) === "end" && "text-right",
                isActionsColumn(cell.column) && "w-px whitespace-nowrap",
              )}
            >
              {isActionsColumn(cell.column) ? (
                <div className="flex items-center justify-end gap-1">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ) : (
                flexRender(cell.column.columnDef.cell, cell.getContext())
              )}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
