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

        const body = (
          <>
            {title && (
              <div className="text-[14px] font-medium text-fg">
                {flexRender(title.column.columnDef.cell, title.getContext())}
              </div>
            )}
            <dl className="flex flex-col gap-1">
              {rest.map((cell) => (
                <div key={cell.id} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-[12px] text-fg-muted">{headers[cell.column.id]}</dt>
                  <dd className="min-w-0 text-right text-[13px] text-fg">
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
              "rounded-sm border border-border bg-surface",
              "data-[state=selected]:border-accent",
            )}
          >
            {activate ? (
              <button
                type="button"
                onClick={activate}
                className="flex w-full flex-col gap-2 p-3 text-left"
              >
                {body}
              </button>
            ) : (
              <div className="flex flex-col gap-2 p-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
