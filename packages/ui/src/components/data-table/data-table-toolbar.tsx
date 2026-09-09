import type { Table } from "@tanstack/react-table";
import { Columns3, Rows3, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "../../utils/cn.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../dropdown-menu.js";
import { IconButton } from "../icon-button.js";
import { Input } from "../input.js";

export interface DataTableToolbarLabels {
  searchPlaceholder: string;
  columns: string;
  density: string;
  densityNormal: string;
  densityCompact: string;
}

export const DEFAULT_TOOLBAR_LABELS: DataTableToolbarLabels = {
  searchPlaceholder: "Cari",
  columns: "Kolom tampil",
  density: "Kepadatan",
  densityNormal: "Normal",
  densityCompact: "Padat",
};

export interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  searchValue: string;
  onSearchChange: (value: string) => void;
  density: "normal" | "compact";
  onDensityChange: (density: "normal" | "compact") => void;
  bulkActions?: ReactNode;
  selectedCount: number;
  labels?: Partial<DataTableToolbarLabels>;
}

export function DataTableToolbar<TData>({
  table,
  searchValue,
  onSearchChange,
  density,
  onDensityChange,
  bulkActions,
  selectedCount,
  labels: labelsOverride,
}: DataTableToolbarProps<TData>) {
  const labels = { ...DEFAULT_TOOLBAR_LABELS, ...labelsOverride };
  const [localSearch, setLocalSearch] = useState(searchValue);

  if (selectedCount > 0 && bulkActions) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-bg px-3 py-2">
        <span className="text-[13px] font-medium text-fg">{selectedCount} baris dipilih</span>
        <div className="flex items-center gap-2">{bulkActions}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="relative w-full max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
          aria-hidden="true"
        />
        <Input
          value={localSearch}
          onChange={(event) => {
            setLocalSearch(event.target.value);
            onSearchChange(event.target.value);
          }}
          placeholder={labels.searchPlaceholder}
          className="pl-9"
          aria-label={labels.searchPlaceholder}
        />
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          icon={<Rows3 />}
          aria-label={`${labels.density}: ${density === "compact" ? labels.densityCompact : labels.densityNormal}`}
          onClick={() => {
            onDensityChange(density === "compact" ? "normal" : "compact");
          }}
          className={cn(density === "compact" && "bg-bg")}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<Columns3 />} aria-label={labels.columns} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllLeafColumns()
              .filter((column) => column.getCanHide())
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
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
