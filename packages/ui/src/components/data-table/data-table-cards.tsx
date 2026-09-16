import type { Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import { Skeleton } from "../skeleton.js";

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
}: DataTableCardsProps<TData>) {
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
    return <div className="rounded-sm border border-border">{emptyState}</div>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const cells = row.getVisibleCells().filter((cell) => cell.column.id !== "select");
        const [title, ...rest] = cells;
        const activate = onRowActivate
          ? () => {
              onRowActivate(row.original);
            }
          : undefined;

        const titleId = `${row.id}-card-title`;
        const body = (
          <>
            {title && (
              <div id={titleId} className="text-[14px] font-medium text-fg">
                {flexRender(title.column.columnDef.cell, title.getContext())}
              </div>
            )}
            <dl className="flex flex-col gap-1">
              {rest.map((cell) => (
                <div key={cell.id} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[12px] text-fg-muted">{headers[cell.column.id]}</dt>
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
              "relative rounded-sm border border-border bg-surface",
              "data-[state=selected]:border-accent",
            )}
          >
            <div className="flex flex-col gap-2 p-3">{body}</div>
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
                className="absolute inset-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
