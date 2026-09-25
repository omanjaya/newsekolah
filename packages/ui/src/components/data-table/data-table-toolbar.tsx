import type { Table } from "@tanstack/react-table";
import { Columns3, Rows3 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../dropdown-menu.js";
import { IconButton } from "../icon-button.js";
import { SearchInput } from "../search-input.js";
import { useUiLabels } from "../ui-labels.js";

export interface DataTableToolbarLabels {
  searchPlaceholder: string;
  columns: string;
  density: string;
  densityNormal: string;
  densityCompact: string;
  noSearchResultsTitle: string;
  noSearchResultsDescription: string;
  clearSearch: string;
}

export const DEFAULT_TOOLBAR_LABELS: DataTableToolbarLabels = {
  searchPlaceholder: "Cari",
  columns: "Kolom tampil",
  density: "Kepadatan",
  densityNormal: "Normal",
  densityCompact: "Padat",
  noSearchResultsTitle: "Tidak ada hasil",
  noSearchResultsDescription: "Coba kata kunci lain atau hapus pencarian.",
  clearSearch: "Hapus pencarian",
};

export function getDataTableColumnLabel(
  meta: unknown,
  header: unknown,
): string | number | undefined {
  if (meta && typeof meta === "object" && "label" in meta) {
    const label = (meta as { label?: unknown }).label;
    if (typeof label === "string" || typeof label === "number") return label;
  }
  return typeof header === "string" || typeof header === "number" ? header : undefined;
}

export interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  showSearch: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  density: "normal" | "compact";
  onDensityChange: (density: "normal" | "compact") => void;
  bulkActions?: ReactNode;
  selectedCount: number;
  columnLabels: Record<string, ReactNode>;
  labels?: Partial<DataTableToolbarLabels>;
}

export function DataTableToolbar<TData>({
  table,
  showSearch,
  searchValue,
  onSearchChange,
  density,
  onDensityChange,
  bulkActions,
  selectedCount,
  columnLabels,
  labels: labelsOverride,
}: DataTableToolbarProps<TData>) {
  const labels = { ...DEFAULT_TOOLBAR_LABELS, ...labelsOverride };
  const uiLabels = useUiLabels();
  const [localSearch, setLocalSearch] = useState(searchValue);

  if (selectedCount > 0 && bulkActions) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-bg px-3 py-2">
        <span className="text-[13px] font-medium text-fg">
          {uiLabels.tableSelectedRows(selectedCount)}
        </span>
        <div className="flex items-center gap-2">{bulkActions}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {showSearch && (
        <SearchInput
          value={localSearch}
          onChange={(event) => {
            setLocalSearch(event.target.value);
            onSearchChange(event.target.value);
          }}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="w-full max-w-sm"
        />
      )}
      <div className="flex items-center gap-1">
        <IconButton
          icon={<Rows3 />}
          aria-label={`${labels.density}: ${density === "compact" ? labels.densityCompact : labels.densityNormal}`}
          onClick={() => {
            onDensityChange(density === "compact" ? "normal" : "compact");
          }}
          className={cn("hidden md:inline-flex", density === "compact" && "bg-bg")}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<Columns3 />} aria-label={labels.columns} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllLeafColumns()
              .filter(
                (column) =>
                  column.getCanHide() &&
                  !["action", "actions", "select"].includes(column.id) &&
                  columnLabels[column.id] !== undefined,
              )
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => {
                    column.toggleVisibility(value);
                  }}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                >
                  {columnLabels[column.id]}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
