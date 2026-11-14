import type { Cell, Column, Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import { Checkbox } from "../checkbox.js";
import { useUiLabels } from "../ui-labels.js";

import { isActionsColumn, SELECT_COLUMN_ID, type DataTableCardRole } from "./column-meta.js";
import { SkeletonCard } from "./data-table-skeleton.js";

export interface DataTableCardsProps<TData> {
  rows: Row<TData>[];
  /**
   * Column id to its rendered header. Passed in rather than derived here
   * because a header is rendered against a header context, which only the
   * table's own header groups can supply.
   */
  headers: Record<string, ReactNode>;
  /** The visible columns, so a loading card can take the shape of the cards it stands in for. */
  columns?: Column<TData>[];
  isLoading?: boolean;
  skeletonRowCount: number;
  onRowActivate?: (row: TData) => void;
  selectionEnabled?: boolean;
  allRowsSelected?: boolean;
  someRowsSelected?: boolean;
  onToggleAllRowsSelected?: () => void;
}

interface CardSlots<T> {
  title?: T;
  subtitle: T[];
  meta: T[];
  fields: T[];
  actions?: T;
}

/**
 * Sorts a row's cells (or, for a loading card, the columns) into the
 * card's hierarchy by each column's `meta.card`; columns without one keep
 * the old layout, the first as the title and the rest as labelled fields.
 */
function cardSlots<TData, T>(items: T[], columnOf: (item: T) => Column<TData>): CardSlots<T> {
  const slots: CardSlots<T> = { subtitle: [], meta: [], fields: [] };
  const shown = items.filter((item) => columnOf(item).id !== SELECT_COLUMN_ID);
  slots.actions = shown.find((item) => isActionsColumn(columnOf(item)));
  const content = shown.filter((item) => item !== slots.actions);
  const roleOf = (item: T) => columnOf(item).columnDef.meta?.card;
  const title =
    content.find((item) => roleOf(item) === "title") ??
    content.find((item) => roleOf(item) === undefined);
  slots.title = title;
  for (const item of content) {
    if (item === title) continue;
    const role: DataTableCardRole = roleOf(item) ?? "field";
    if (role === "subtitle") slots.subtitle.push(item);
    else if (role === "meta") slots.meta.push(item);
    else if (role !== "hidden") slots.fields.push(item);
  }
  return slots;
}

function cardParts<TData>(row: Row<TData>): CardSlots<Cell<TData, unknown>> {
  return cardSlots(row.getVisibleCells(), (cell: Cell<TData, unknown>) => cell.column);
}

function render<TData>(cell: Cell<TData, unknown>): ReactNode {
  return flexRender(cell.column.columnDef.cell, cell.getContext());
}

/**
 * A link or button inside a card is lifted above the card's own tap
 * target and given a thumb-sized height, so it stays its own control.
 */
const LIFT_CONTROLS =
  "[&_a]:relative [&_a]:z-10 [&_button]:relative [&_button]:z-10 " +
  "[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_button]:min-h-11";

/**
 * The same rows as a stacked list, for a screen too narrow to hold the
 * table. A table that only scrolls sideways on a phone hides the columns
 * that carry the answer; a card puts the row in front of the reader as a
 * title, a muted subtitle, inline meta (badges, a status) and, only then,
 * labelled fields. Built from the same column definitions, so a column
 * added to the table appears here too and the two cannot drift apart.
 */
export function DataTableCards<TData>({
  rows,
  headers,
  columns = [],
  isLoading,
  skeletonRowCount,
  onRowActivate,
  selectionEnabled,
  allRowsSelected,
  someRowsSelected,
  onToggleAllRowsSelected,
}: DataTableCardsProps<TData>): ReactElement {
  const uiLabels = useUiLabels();
  if (isLoading) {
    const parts = cardSlots(columns, (column: Column<TData>) => column);
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: skeletonRowCount }).map((_, index) => (
          <SkeletonCard key={index} parts={parts} />
        ))}
      </div>
    );
  }

  return (
    // Mounted when loading ends, so the cards fade in once over the skeleton's place.
    <div className="flex animate-fade-in flex-col gap-2">
      {selectionEnabled && onToggleAllRowsSelected && (
        <div className="flex min-h-11 items-center gap-3 px-4 text-label text-fg">
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
        {rows.map((row) => (
          <DataTableCard
            key={row.id}
            row={row}
            headers={headers}
            selectionEnabled={selectionEnabled}
            selectLabel={uiLabels.tableSelectRow}
            onActivate={
              onRowActivate
                ? () => {
                    onRowActivate(row.original);
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}

function DataTableCard<TData>({
  row,
  headers,
  selectionEnabled,
  selectLabel,
  onActivate,
}: {
  row: Row<TData>;
  headers: Record<string, ReactNode>;
  selectionEnabled?: boolean;
  selectLabel: string;
  onActivate?: () => void;
}): ReactElement {
  const { title, subtitle, meta, fields, actions } = cardParts(row);
  const titleId = `${row.id}-card-title`;
  const selected = row.getIsSelected();

  return (
    <li
      data-state={selected ? "selected" : undefined}
      className={cn(
        "relative rounded-lg border border-border bg-surface shadow-1 transition-colors",
        "data-[state=selected]:border-accent data-[state=selected]:bg-state-selected",
      )}
    >
      {/* Dense on purpose: 12px above and below, 6px between the title,
          the meta row and the fields, and no rule between them, so a
          three-field card stays about two thirds of its old height. */}
      <div className="flex items-start gap-3 px-4 py-3">
        {selectionEnabled && row.getCanSelect() && (
          // Level with the title's first 20px line.
          <span className="relative z-10 flex h-5 shrink-0 items-center">
            <Checkbox
              checked={selected}
              onCheckedChange={(value) => {
                row.toggleSelected(!!value);
              }}
              aria-label={selectLabel}
            />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              {title && (
                <div
                  id={titleId}
                  className={cn("min-w-0 text-body font-semibold text-fg", LIFT_CONTROLS)}
                >
                  {render(title)}
                </div>
              )}
              {subtitle.map((cell) => (
                <div key={cell.id} className="min-w-0 truncate text-body-sm text-fg-muted">
                  {render(cell)}
                </div>
              ))}
            </div>
            {actions ? (
              <div className="relative z-10 -my-2.5 -mr-2 flex shrink-0 items-center [&_a]:min-h-11 [&_a]:min-w-11 [&_button]:min-h-11 [&_button]:min-w-11">
                {render(actions)}
              </div>
            ) : (
              onActivate && (
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              )
            )}
          </div>
          {meta.length > 0 && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1.5 text-body-sm text-fg-muted",
                LIFT_CONTROLS,
              )}
            >
              {meta.map((cell) => (
                <span key={cell.id} className="inline-flex min-w-0 items-center">
                  {render(cell)}
                </span>
              ))}
            </div>
          )}
          {fields.length > 0 && (
            <dl className="flex flex-col gap-1.5">
              {fields.map((cell) => (
                // Label and value share a baseline. The value sits in a
                // box pushed to the end that is only as wide as its
                // content, so a cell that brings its own full-width wrapper
                // (a list of badges) lines up on the right with plain text.
                <div key={cell.id} className="flex items-baseline gap-3">
                  <dt className="max-w-1/2 shrink-0 text-caption text-fg-muted">
                    {headers[cell.column.id]}
                  </dt>
                  <dd
                    className={cn(
                      "flex min-w-0 flex-1 justify-end text-body text-fg",
                      LIFT_CONTROLS,
                    )}
                  >
                    <span className="min-w-0 text-right">{render(cell)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {/*
        The whole card opens the row, but a cell may hold its own button or
        link, and one button cannot sit inside another. So the row's tap
        target is an overlay covering the card, and the cells lift their
        own controls above it with z-10.
      */}
      {onActivate && (
        <button
          type="button"
          onClick={onActivate}
          aria-labelledby={title ? titleId : undefined}
          className="absolute inset-0 rounded-lg transition-colors hover:bg-state-hover active:bg-state-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        />
      )}
    </li>
  );
}
