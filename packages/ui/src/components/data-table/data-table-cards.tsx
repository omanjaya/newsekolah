import type { Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import { Checkbox } from "../checkbox.js";
import { Skeleton } from "../skeleton.js";
import { useUiLabels } from "../ui-labels.js";

/** Column id whose cell renders row actions; see the card layout below. */
const ACTIONS_COLUMN_ID = "actions";

export interface DataTableCardsProps<TData> {
  rows: Row<TData>[];
  /**
   * Column id to its rendered header. Passed in rather than derived here
   * because a header is rendered against a header context, which only the
   * table's own header groups can supply.
   */
  headers: Record<string, ReactNode>;
  isLoading?: boolean;
  skeletonRowCount: number;
  emptyState?: ReactNode;
  onRowActivate?: (row: TData) => void;
  selectionEnabled?: boolean;
  allRowsSelected?: boolean;
  someRowsSelected?: boolean;
  onToggleAllRowsSelected?: () => void;
}

/**
 * The same rows as a stacked list, for a screen too narrow to hold the
 * table. A table that only scrolls sideways on a phone hides the columns
 * that carry the answer, and nothing on screen says they are there; a card
 * puts every field of one row in front of the reader at once.
 *
 * Built from the same column definitions, so a column added to the table
 * appears here too and the two cannot drift apart.
 */
export function DataTableCards<TData>({
  rows,
  headers,
  isLoading,
  skeletonRowCount,
  emptyState,
  onRowActivate,
  selectionEnabled,
  allRowsSelected,
  someRowsSelected,
  onToggleAllRowsSelected,
}: DataTableCardsProps<TData>) {
  const uiLabels = useUiLabels();
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: skeletonRowCount }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="rounded-lg border border-border">{emptyState}</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {selectionEnabled && onToggleAllRowsSelected && (
        <div className="flex min-h-11 items-center gap-2 text-[13px] font-medium text-fg">
          <Checkbox
            checked={allRowsSelected === true ? true : someRowsSelected ? "indeterminate" : false}
            onCheckedChange={() => {
              onToggleAllRowsSelected();
            }}
            aria-label={uiLabels.tableSelectAllRows}
          />
          {uiLabels.tableSelectAllRows}
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const cells = row.getVisibleCells().filter((cell) => cell.column.id !== "select");
          // A column with id "actions" holds the row's buttons, not a field:
          // on a card it sits beside the title instead of taking a labelled
          // row of its own at the bottom.
          const actions = cells.find((cell) => cell.column.id === ACTIONS_COLUMN_ID);
          const [title, ...rest] = cells.filter((cell) => cell !== actions);
          const activate = onRowActivate
            ? () => {
                onRowActivate(row.original);
              }
            : undefined;

          const titleId = `${row.id}-card-title`;
          const body = (
            <>
              {(title ?? actions) && (
                <div className="flex items-start justify-between gap-2">
                  {title && (
                    <div id={titleId} className="min-w-0 text-[14px] font-medium text-fg">
                      {flexRender(title.column.columnDef.cell, title.getContext())}
                    </div>
                  )}
                  {actions && (
                    <div className="relative z-10 -my-1 -mr-1 flex shrink-0 items-center [&_a]:min-h-11 [&_a]:min-w-11 [&_button]:min-h-11 [&_button]:min-w-11">
                      {flexRender(actions.column.columnDef.cell, actions.getContext())}
                    </div>
                  )}
                </div>
              )}
              <dl className="flex flex-col gap-1">
                {rest.map((cell) => (
                  <div key={cell.id} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-[12px] text-fg-muted">
                      {headers[cell.column.id]}
                    </dt>
                    {/*
                    A link or button sitting in a cell is a real tap target
                    on a phone, so give it a thumb-sized height here rather
                    than leaving it as tall as its text.
                  */}
                    <dd className="min-w-0 text-right text-[13px] text-fg [&_a]:relative [&_a]:z-10 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_button]:relative [&_button]:z-10 [&_button]:inline-flex [&_button]:min-h-11 [&_button]:items-center">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          );

          return (
            <li
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className={cn(
                "relative rounded-lg border border-border bg-surface",
                "data-[state=selected]:border-accent",
              )}
            >
              <div className="flex flex-col gap-2 p-3">
                {selectionEnabled && row.getCanSelect() && (
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => {
                      row.toggleSelected(!!value);
                    }}
                    aria-label={uiLabels.tableSelectRow}
                    className="relative z-10"
                  />
                )}
                {body}
              </div>
              {/*
              The whole card opens the row, but a cell may hold its own
              button or link, and one button cannot sit inside another. So
              the row's tap target is an overlay covering the card, and the
              cells lift their own controls above it with z-10.
            */}
              {activate && (
                <button
                  type="button"
                  onClick={activate}
                  aria-labelledby={title ? titleId : undefined}
                  className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
