"use client";

import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, type ReactElement, type ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import { IconButton } from "../icon-button.js";
import { Select } from "../select.js";
import { useUiLabels } from "../ui-labels.js";

export interface DataTablePaginationLabels {
  pageLabel: (current: number, total: number) => string;
  previous: string;
  next: string;
}

/**
 * Legacy: the defaults now come from `UiLabels` (`tablePageOf`,
 * `tablePrevious`, `tableNext`), so a locale provider translates them; this
 * constant only keeps the old export working.
 */
export const DEFAULT_PAGINATION_LABELS: DataTablePaginationLabels = {
  pageLabel: (current, total) => `Halaman ${current} dari ${total}`,
  previous: "Ke halaman sebelumnya",
  next: "Ke halaman berikutnya",
};

/** Previous and next for a list that pages by cursor or offset without a total. */
export interface DataTableCursorPagination {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** 1-based page; with `pageSize` the footer shows "Baris 51–100". */
  page?: number;
  pageSize?: number;
}

interface PaginationBarProps {
  summary?: ReactNode;
  pageLabel?: string;
  navigation: boolean;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  pageSize?: { value: number; options: number[]; onChange: (size: number) => void };
  /**
   * A page is loading: previous and next stay where they are (a focused
   * button keeps its focus) but do nothing until the rows arrive.
   */
  busy?: boolean;
  className?: string;
}

/**
 * The one pagination footer every table mode shares: what is shown on the
 * left ("1–10 dari 48", or "12 data" for a single page), and on the right
 * the page size, the page and previous/next. Navigation disappears when
 * there is nowhere to go.
 */
export function PaginationBar({
  summary,
  pageLabel,
  navigation,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  pageSize,
  busy = false,
  className,
}: PaginationBarProps): ReactElement {
  const labels = useUiLabels();
  const pageSizeId = useId();
  return (
    <div
      data-slot="data-table-pagination"
      className={cn("flex min-h-12 items-center justify-between gap-x-4 gap-y-2", className)}
    >
      <p className="min-w-0 text-body-sm text-fg-muted tabular-nums" aria-live="polite">
        {summary}
      </p>
      {(navigation || pageSize) && (
        <div className="flex shrink-0 items-center gap-4">
          {pageSize && (
            <div className="hidden items-center gap-2 sm:flex">
              <span id={pageSizeId} className="text-body-sm whitespace-nowrap text-fg-muted">
                {labels.tablePageSize}
              </span>
              <Select
                size="sm"
                aria-labelledby={pageSizeId}
                value={String(pageSize.value)}
                onValueChange={(next) => {
                  pageSize.onChange(Number(next));
                }}
                options={pageSize.options.map((option) => ({
                  value: String(option),
                  label: String(option),
                }))}
                className="w-18 tabular-nums"
              />
            </div>
          )}
          {navigation && (
            <div className="flex items-center gap-1">
              {pageLabel !== undefined && (
                <span className="mr-2 hidden text-body-sm whitespace-nowrap text-fg-muted tabular-nums sm:inline">
                  {pageLabel}
                </span>
              )}
              <IconButton
                icon={<ChevronLeft />}
                aria-label={previousLabel}
                onClick={busy ? undefined : onPrevious}
                disabled={!canPrevious}
                aria-disabled={busy && canPrevious ? true : undefined}
              />
              <IconButton
                icon={<ChevronRight />}
                aria-label={nextLabel}
                onClick={busy ? undefined : onNext}
                disabled={!canNext}
                aria-disabled={busy && canNext ? true : undefined}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  /** Overrides the table's own count, e.g. a local table's filtered pages. */
  pageCount?: number;
  /** All rows across pages, when known; drives "1–10 dari 48". */
  totalRows?: number;
  /**
   * Offers a page size picker (from `sm` up) with these choices whenever
   * the rows outnumber the smallest one, so a size that fits every row on
   * one page can still be changed back.
   */
  pageSizeOptions?: number[];
  labels?: Partial<DataTablePaginationLabels>;
  /** See `PaginationBar`'s `busy`. */
  busy?: boolean;
  className?: string;
}

/** `PaginationBar` driven by a TanStack table, for the local and server modes. */
export function DataTablePagination<TData>({
  table,
  pageCount: pageCountOverride,
  totalRows,
  pageSizeOptions,
  labels: labelsOverride,
  busy,
  className,
}: DataTablePaginationProps<TData>): ReactElement {
  const uiLabels = useUiLabels();
  const pageLabelOf = labelsOverride?.pageLabel ?? uiLabels.tablePageOf;
  const { pageIndex, pageSize } = table.getState().pagination;
  const rawPageCount = pageCountOverride ?? table.getPageCount();
  // A TanStack table created with `pageCount: -1` has an unknown number of
  // pages: it keeps previous and next, without "of N". `DataTable` always
  // knows its count (the rows, or `rowCount`), so only a caller's own
  // table reaches this.
  const knownPageCount = rawPageCount >= 0 ? Math.max(1, rawPageCount) : undefined;
  const multiPage = knownPageCount === undefined || knownPageCount > 1;
  const sizes = pageSizeOptions ?? [];
  const offersPageSize =
    sizes.length > 1 && (totalRows !== undefined ? totalRows > Math.min(...sizes) : multiPage);
  const shown = table.getRowModel().rows.length;
  const from = pageIndex * pageSize + 1;
  const to = pageIndex * pageSize + shown;
  // A server page past the end (its last row was just deleted) keeps the
  // way back, without a "Halaman 6 dari 5".
  const pastLastPage = knownPageCount !== undefined && pageIndex >= knownPageCount;

  let summary: string | undefined;
  if (shown === 0) {
    summary = totalRows !== undefined ? uiLabels.tableRowCount(totalRows) : undefined;
  } else if (totalRows !== undefined) {
    summary = multiPage
      ? uiLabels.tableRange(from, Math.min(to, totalRows), totalRows)
      : uiLabels.tableRowCount(totalRows);
  } else {
    summary = uiLabels.tableRangeOpen(from, to);
  }

  return (
    <PaginationBar
      className={className}
      summary={summary}
      pageLabel={
        knownPageCount !== undefined && !pastLastPage
          ? pageLabelOf(pageIndex + 1, knownPageCount)
          : undefined
      }
      navigation={multiPage || pageIndex > 0}
      canPrevious={table.getCanPreviousPage()}
      canNext={table.getCanNextPage()}
      onPrevious={() => {
        table.previousPage();
      }}
      onNext={() => {
        table.nextPage();
      }}
      previousLabel={labelsOverride?.previous ?? uiLabels.tablePrevious}
      nextLabel={labelsOverride?.next ?? uiLabels.tableNext}
      busy={busy}
      pageSize={
        offersPageSize
          ? {
              value: pageSize,
              options: sizes.includes(pageSize)
                ? sizes
                : [...sizes, pageSize].sort((a, b) => a - b),
              onChange: (size) => {
                table.setPageSize(size);
              },
            }
          : undefined
      }
    />
  );
}

/** `PaginationBar` for `DataTable mode="cursor"`. */
export function DataTableCursorFooter({
  cursor,
  shownRows,
  busy,
  className,
}: {
  cursor: DataTableCursorPagination;
  shownRows: number;
  busy?: boolean;
  className?: string;
}): ReactElement {
  const uiLabels = useUiLabels();
  const navigation = cursor.hasPrevious || cursor.hasNext;
  let summary: string | undefined;
  if (!navigation) summary = uiLabels.tableRowCount(shownRows);
  else if (cursor.page !== undefined && cursor.pageSize !== undefined && shownRows > 0) {
    const from = (cursor.page - 1) * cursor.pageSize + 1;
    summary = uiLabels.tableRangeOpen(from, from + shownRows - 1);
  }
  return (
    <PaginationBar
      className={className}
      summary={summary}
      navigation={navigation}
      canPrevious={cursor.hasPrevious}
      canNext={cursor.hasNext}
      onPrevious={cursor.onPrevious}
      onNext={cursor.onNext}
      previousLabel={uiLabels.tablePrevious}
      nextLabel={uiLabels.tableNext}
      busy={busy}
    />
  );
}
