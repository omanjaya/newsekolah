import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "../empty-state.js";

import { DataTable } from "./data-table.js";

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: "1", name: "Siti Aminah" },
  { id: "2", name: "Budi Santoso" },
];

const columns: ColumnDef<Row>[] = [{ accessorKey: "name", header: "Nama" }];

function Harness(props: {
  data: Row[];
  rowCount: number;
  isLoading?: boolean;
  onSortingChange?: (sorting: SortingState) => void;
  onGlobalFilterChange?: (value: string) => void;
}) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  return (
    <DataTable
      data={props.data}
      columns={columns}
      rowCount={props.rowCount}
      pagination={pagination}
      onPaginationChange={setPagination}
      sorting={sorting}
      onSortingChange={(updater) => {
        setSorting(updater);
        const next = typeof updater === "function" ? updater(sorting) : updater;
        props.onSortingChange?.(next);
      }}
      globalFilter={globalFilter}
      onGlobalFilterChange={(value) => {
        setGlobalFilter(value);
        props.onGlobalFilterChange?.(value);
      }}
      isLoading={props.isLoading}
      emptyState={<EmptyState title="Belum ada data" />}
    />
  );
}

describe("DataTable", () => {
  // Every row renders twice: once in the table for wide screens and once
  // as a card for narrow ones, with CSS deciding which is shown. jsdom
  // applies no media query, so both are in the document here.
  it("renders rows from `data`", () => {
    render(<Harness data={ROWS} rowCount={ROWS.length} />);
    expect(screen.getAllByText("Siti Aminah").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Budi Santoso").length).toBeGreaterThan(0);
  });

  it("renders the same rows as cards for a narrow screen", () => {
    render(<Harness data={ROWS} rowCount={ROWS.length} />);
    // The card list carries one item per row, each labelled by its header.
    expect(screen.getAllByRole("listitem")).toHaveLength(ROWS.length);
  });

  it("shows the empty state slot when there are no rows and not loading", () => {
    render(<Harness data={[]} rowCount={0} />);
    expect(screen.getAllByText("Belum ada data").length).toBeGreaterThan(0);
  });

  it("renders skeleton rows instead of data while loading", () => {
    render(<Harness data={ROWS} rowCount={ROWS.length} isLoading />);
    expect(screen.queryByText("Siti Aminah")).not.toBeInTheDocument();
  });

  it("calls onSortingChange when a sortable header is clicked", async () => {
    const onSortingChange = vi.fn();
    render(<Harness data={ROWS} rowCount={ROWS.length} onSortingChange={onSortingChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Nama" }));
    expect(onSortingChange).toHaveBeenCalledWith([{ id: "name", desc: false }]);
  });

  it("debounces onGlobalFilterChange from the search input", () => {
    vi.useFakeTimers();
    const onGlobalFilterChange = vi.fn();
    render(
      <Harness data={ROWS} rowCount={ROWS.length} onGlobalFilterChange={onGlobalFilterChange} />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Cari" }), { target: { value: "sit" } });
    expect(onGlobalFilterChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onGlobalFilterChange).toHaveBeenLastCalledWith("sit");

    vi.useRealTimers();
  });
});
