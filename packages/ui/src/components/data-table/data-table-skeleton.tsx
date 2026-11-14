import type { Column } from "@tanstack/react-table";
import type { ReactElement } from "react";

import { cn } from "../../utils/cn.js";

import {
  columnAlign,
  columnSkeleton,
  isActionsColumn,
  SELECT_COLUMN_ID,
  type DataTableSkeletonShape,
} from "./column-meta.js";

/**
 * Placeholders shaped like the cells and cards they stand in for. Each bar
 * sits centred on one line box of the text around it (`h-lh`), so a
 * placeholder row is exactly as tall as the row that replaces it and the
 * table does not jump when the data arrives (`ColumnMeta.skeleton` names
 * the shape of a column's content).
 */

/** The shimmering fill, as `Skeleton` draws it. */
function Bar({ className }: { className: string }): ReactElement {
  return (
    <span role="presentation" data-slot="skeleton" className={cn("skeleton block", className)} />
  );
}

/** A bar on one line of the surrounding text (or of `textClassName`'s). */
function Line({
  width,
  textClassName,
  end,
}: {
  width: string;
  textClassName?: string;
  end?: boolean;
}): ReactElement {
  return (
    <span className={cn("flex h-lh items-center", end && "justify-end", textClassName)}>
      <Bar className={cn("h-3 rounded-xs", width)} />
    </span>
  );
}

/** A pill the size of a default `Badge`. */
function Pill({ end }: { end?: boolean }): ReactElement {
  return (
    <span className={cn("flex", end && "justify-end")}>
      <Bar className="h-6 w-16 rounded-full" />
    </span>
  );
}

/** Two lines, the second in caption size: a name over a username. */
function TwoLines({ width }: { width: string }): ReactElement {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <Line width={width} />
      <Line width="w-16" textClassName="text-caption" />
    </span>
  );
}

function Shape({
  shape,
  width,
  end,
}: {
  shape: DataTableSkeletonShape;
  width: string;
  end?: boolean;
}): ReactElement {
  if (shape === "badge") return <Pill end={end} />;
  if (shape === "lines") return <TwoLines width={width} />;
  if (shape === "avatar") {
    return (
      <span className="flex items-center gap-3">
        <Bar className="size-8 shrink-0 rounded-full" />
        <TwoLines width={width} />
      </span>
    );
  }
  return <Line width={width} end={end} />;
}

/**
 * One cell of a placeholder row in the desktop table. The actions column
 * holds an empty box the size of its icon buttons (44px on touch), so the
 * row keeps the height the buttons give it without a shimmer that reads as
 * a button; the selection column holds a checkbox-sized square.
 */
export function SkeletonCell<TData>({
  column,
  first,
}: {
  column: Column<TData>;
  first: boolean;
}): ReactElement {
  if (isActionsColumn(column)) {
    return <span aria-hidden="true" className="ml-auto block size-8 pointer-coarse:size-11" />;
  }
  if (column.id === SELECT_COLUMN_ID) {
    return (
      <span className="flex h-lh items-center">
        <Bar className="size-4 rounded-xs" />
      </span>
    );
  }
  return (
    <Shape
      shape={columnSkeleton(column)}
      width={first ? "w-3/4 max-w-48" : "w-1/2 max-w-28"}
      end={columnAlign(column) === "end"}
    />
  );
}

export interface SkeletonCardParts<TData> {
  title?: Column<TData>;
  subtitle: Column<TData>[];
  meta: Column<TData>[];
  fields: Column<TData>[];
}

/**
 * A placeholder phone card with the loaded card's structure (title,
 * subtitles, the meta row, labelled fields) and its spacing, so a card
 * keeps its height when the row replaces it.
 */
export function SkeletonCard<TData>({ parts }: { parts: SkeletonCardParts<TData> }): ReactElement {
  const titleShape = parts.title ? columnSkeleton(parts.title) : "text";
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3 shadow-1">
      <div className="flex min-w-0 flex-col gap-0.5">
        {titleShape === "avatar" || titleShape === "lines" ? (
          <span className="text-body">
            <Shape shape={titleShape} width="w-2/3 max-w-48" />
          </span>
        ) : (
          <Line width="w-2/3 max-w-48" textClassName="text-body" />
        )}
        {parts.subtitle.map((column) => (
          <Line key={column.id} width="w-1/3 max-w-28" textClassName="text-body-sm" />
        ))}
      </div>
      {parts.meta.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-body-sm">
          {parts.meta.map((column) =>
            columnSkeleton(column) === "text" ? (
              <Line key={column.id} width="w-16" />
            ) : (
              <Pill key={column.id} />
            ),
          )}
        </div>
      )}
      {parts.fields.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {parts.fields.map((column) => (
            <div key={column.id} className="flex items-center justify-between gap-3">
              <Line width="w-14" textClassName="text-caption" />
              {columnSkeleton(column) === "badge" ? (
                <Pill end />
              ) : (
                <Line width="w-20" textClassName="text-body" end />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
