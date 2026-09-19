import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { IconButton } from "../icon-button.js";

export interface DataTablePaginationLabels {
  pageLabel: (current: number, total: number) => string;
  previous: string;
  next: string;
}

export const DEFAULT_PAGINATION_LABELS: DataTablePaginationLabels = {
  pageLabel: (current, total) => `Halaman ${current} dari ${total}`,
  previous: "Ke halaman sebelumnya",
  next: "Ke halaman berikutnya",
};

export interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageCount?: number;
  labels?: Partial<DataTablePaginationLabels>;
}

export function DataTablePagination<TData>({
  table,
  pageCount: pageCountOverride,
  labels: labelsOverride,
}: DataTablePaginationProps<TData>) {
  const labels = { ...DEFAULT_PAGINATION_LABELS, ...labelsOverride };
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = Math.max(1, pageCountOverride ?? table.getPageCount());

  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <span className="text-[13px] tabular-nums text-fg-muted">
        {labels.pageLabel(pageIndex + 1, pageCount)}
      </span>
      <div className="flex items-center gap-1">
        <IconButton
          icon={<ChevronLeft />}
          aria-label={labels.previous}
          onClick={() => {
            table.previousPage();
          }}
          disabled={!table.getCanPreviousPage()}
        />
        <IconButton
          icon={<ChevronRight />}
          aria-label={labels.next}
          onClick={() => {
            table.nextPage();
          }}
          disabled={!table.getCanNextPage()}
        />
      </div>
    </div>
  );
}
