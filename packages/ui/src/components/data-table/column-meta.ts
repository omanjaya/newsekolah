import type { Column, RowData } from "@tanstack/react-table";

/**
 * Where a column's value goes on the phone card:
 * - "title": the card's first line (default: the first visible column).
 * - "subtitle": a muted line under the title (a username, a code, a class).
 * - "meta": inline under the title with the other meta columns, no label:
 *   badges, a status, a short date.
 * - "field": a labelled row below (default for every other column).
 * - "hidden": not on the card at all (it stays in the desktop table).
 */
export type DataTableCardRole = "title" | "subtitle" | "meta" | "field" | "hidden";

/**
 * What a column's cells show while the table loads, shaped like the content
 * that replaces them, so the rows (and phone cards) keep their height when
 * the data arrives instead of jumping taller:
 * - "text" (default): one bar on a line of text.
 * - "lines": two lines, a name over a code or a username.
 * - "avatar": a 32px avatar beside two lines (a person).
 * - "badge": a pill (a status, a role).
 * The actions column needs none: it keeps its buttons' room by itself.
 */
export type DataTableSkeletonShape = "text" | "lines" | "avatar" | "badge";

declare module "@tanstack/react-table" {
  // TanStack's own declaration takes these two parameters; a merge must repeat them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Plain-text name for the column menu when `header` is not a string. */
    label?: string;
    /** See `DataTableCardRole`. */
    card?: DataTableCardRole;
    /** "end" right-aligns the header and cells (amounts, counts, actions). */
    align?: "start" | "end";
    /** See `DataTableSkeletonShape`. */
    skeleton?: DataTableSkeletonShape;
  }
}

/** Column id of the row's buttons: right-aligned, fit to its content, its header for assistive tech only. */
export const ACTIONS_COLUMN_ID = "actions";
export const SELECT_COLUMN_ID = "select";

/**
 * Column ids the column menu has always left out. "action" is not the
 * row-actions column (tables use it for data: an audit entry's action, a
 * promotion decision), so it only keeps its old place outside the menu.
 */
const UNLISTED_COLUMN_IDS: readonly string[] = [ACTIONS_COLUMN_ID, SELECT_COLUMN_ID, "action"];

/** Only the exact `ACTIONS_COLUMN_ID`: a data column named "action" stays an ordinary column. */
export function isActionsColumn<TData>(column: Column<TData>): boolean {
  return column.id === ACTIONS_COLUMN_ID;
}

/** Whether the column menu may offer to hide or show this column. */
export function isListedInColumnMenu<TData>(column: Column<TData>): boolean {
  return !UNLISTED_COLUMN_IDS.includes(column.id);
}

export function columnAlign<TData>(column: Column<TData>): "start" | "end" {
  return column.columnDef.meta?.align ?? (isActionsColumn(column) ? "end" : "start");
}

export function columnSkeleton<TData>(column: Column<TData>): DataTableSkeletonShape {
  return column.columnDef.meta?.skeleton ?? "text";
}
