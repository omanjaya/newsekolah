import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "../empty-state.js";

import { DataTableStateProvider } from "./data-table-state.js";
import { DataTable, selectionColumn } from "./data-table.js";

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: "1", name: "Siti Aminah" },
  { id: "2", name: "Budi Santoso" },
];

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Nama" },
  { id: "actions", header: "Aksi", cell: () => null },
];

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

function LocalHarness({ data }: { data: Row[] }) {
  return (
    <DataTable
      mode="local"
      data={data}
      columns={columns}
      emptyState={<EmptyState title="Belum ada data" />}
    />
  );
}

function CursorHarness() {
  return (
    <DataTable
      mode="cursor"
      data={ROWS}
      columns={columns}
      rowCount={100}
      pagination={{ pageIndex: 0, pageSize: 10 }}
      onPaginationChange={() => undefined}
      sorting={[]}
      onSortingChange={() => undefined}
      emptyState={<EmptyState title="Belum ada data" />}
    />
  );
}

function SelectionHarness() {
  const [rowSelection, setRowSelection] = useState({});

  return (
    <DataTable
      mode="local"
      data={ROWS}
      columns={[selectionColumn<Row>(), ...columns]}
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      emptyState={<EmptyState title="Belum ada data" />}
    />
  );
}

function ActivationHarness({ onActivate }: { onActivate: (row: Row) => void }) {
  return (
    <DataTable
      mode="local"
      data={ROWS}
      columns={columns}
      onRowActivate={onActivate}
      emptyState={<EmptyState title="Belum ada data" />}
    />
  );
}

function RememberedHarness({ visible }: { visible: boolean }) {
  return (
    <DataTableStateProvider scope="tenant:user:year:/classes">
      {visible && (
        <DataTable
          mode="local"
          stateKey="classes"
          data={ROWS}
          columns={columns}
          emptyState={<EmptyState title="Belum ada data" />}
        />
      )}
    </DataTableStateProvider>
  );
}

function AsyncRememberedHarness({
  data,
  isLoading,
  scope = "tenant:user:year:/classes",
}: {
  data: Row[];
  isLoading: boolean;
  scope?: string;
}) {
  return (
    <DataTableStateProvider scope={scope}>
      <DataTable
        mode="local"
        stateKey="classes"
        data={data}
        isLoading={isLoading}
        columns={columns}
        emptyState={<EmptyState title="Belum ada data" />}
      />
    </DataTableStateProvider>
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

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onGlobalFilterChange).toHaveBeenLastCalledWith("sit");

    vi.useRealTimers();
  });

  it("filters local rows and resets the current page", () => {
    vi.useFakeTimers();
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: String(index),
      name: index === 50 ? "Siti Aminah" : `Siswa ${index}`,
    }));
    render(<LocalHarness data={rows} />);

    fireEvent.click(screen.getByRole("button", { name: "Ke halaman berikutnya" }));
    expect(screen.getAllByText("Siti Aminah").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("textbox", { name: "Cari" }), { target: { value: "Siti" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getAllByText("Siti Aminah").length).toBeGreaterThan(0);
    expect(screen.queryByText("Siswa 0")).not.toBeInTheDocument();
    expect(screen.getByText("Halaman 1 dari 1")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Cari" }), {
      target: { value: "missing" },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getAllByText("Tidak ada hasil").length).toBeGreaterThan(0);
    const [clearSearch] = screen.getAllByRole("button", { name: "Hapus pencarian" });
    if (!clearSearch) throw new Error("Clear search action is missing");
    fireEvent.click(clearSearch);
    expect(screen.getByRole("textbox", { name: "Cari" })).toHaveValue("");
    expect(screen.getAllByText("Siswa 0").length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("does not render offset pagination for cursor data", () => {
    render(<CursorHarness />);
    expect(screen.queryByText(/Halaman 1 dari/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Cari" })).not.toBeInTheDocument();
  });

  it("uses column headers in the visibility menu and keeps action columns out", async () => {
    render(<LocalHarness data={ROWS} />);
    await userEvent.click(screen.getByRole("button", { name: "Kolom tampil" }));

    expect(screen.getByRole("menuitemcheckbox", { name: "Nama" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox", { name: "Aksi" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Nama" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Kolom tampil" }));

    const nameColumn = screen.getByRole("menuitemcheckbox", { name: "Nama" });
    expect(nameColumn).toHaveAttribute("data-state", "unchecked");
    await userEvent.click(nameColumn);
    expect(screen.getByRole("menuitemcheckbox", { name: "Nama" })).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  it("provides select all for mobile cards", () => {
    render(<SelectionHarness />);
    expect(screen.getAllByLabelText("Pilih semua baris").length).toBeGreaterThan(1);
  });

  it("moves actual row focus with j/k and activates the focused row with Enter", () => {
    const onActivate = vi.fn();
    render(<ActivationHarness onActivate={onActivate} />);
    const [, firstRow, secondRow] = screen.getAllByRole("row");
    if (!firstRow || !secondRow) throw new Error("Table rows are missing");

    firstRow.focus();
    fireEvent.keyDown(firstRow, { key: "j" });
    expect(secondRow).toHaveFocus();

    fireEvent.keyDown(secondRow, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(ROWS[1]);
    fireEvent.keyDown(secondRow, { key: "k" });
    expect(firstRow).toHaveFocus();
  });

  it("restores explicitly keyed local state after a route return", () => {
    vi.useFakeTimers();
    const view = render(<RememberedHarness visible />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cari" }), { target: { value: "Siti" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    view.rerender(<RememberedHarness visible={false} />);
    view.rerender(<RememberedHarness visible />);
    expect(screen.getByRole("textbox", { name: "Cari" })).toHaveValue("Siti");
    vi.useRealTimers();
  });

  it("keeps remembered search and page through an empty loading remount", () => {
    vi.useFakeTimers();
    const rows = Array.from({ length: 52 }, (_, index) => ({
      id: String(index),
      name: index === 51 ? "Siti Aminah" : `Siswa ${index}`,
    }));
    const view = render(<AsyncRememberedHarness data={rows} isLoading={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cari" }), { target: { value: "Siswa" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.click(screen.getByRole("button", { name: "Ke halaman berikutnya" }));
    expect(screen.getAllByText("Siswa 50").length).toBeGreaterThan(0);

    view.rerender(<AsyncRememberedHarness data={[]} isLoading />);
    view.rerender(<AsyncRememberedHarness data={rows} isLoading={false} />);
    expect(screen.getByRole("textbox", { name: "Cari" })).toHaveValue("Siswa");
    expect(screen.getAllByText("Siswa 50").length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("clamps a local page after settled data shrinks", () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: String(index),
      name: index === 50 ? "Siti Aminah" : `Siswa ${index}`,
    }));
    const view = render(<AsyncRememberedHarness data={rows} isLoading={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Ke halaman berikutnya" }));
    expect(screen.getAllByText("Siti Aminah").length).toBeGreaterThan(0);

    const finalRow = rows[50];
    if (!finalRow) throw new Error("Final row is missing");
    view.rerender(<AsyncRememberedHarness data={[finalRow]} isLoading={false} />);
    expect(screen.getAllByText("Siti Aminah").length).toBeGreaterThan(0);
  });

  it("does not expose remembered state across scopes", () => {
    vi.useFakeTimers();
    const view = render(<AsyncRememberedHarness data={ROWS} isLoading={false} scope="tenant:a" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cari" }), { target: { value: "Siti" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    view.rerender(<AsyncRememberedHarness data={ROWS} isLoading={false} scope="tenant:b" />);
    expect(screen.getByRole("textbox", { name: "Cari" })).toHaveValue("");
    vi.useRealTimers();
  });
});
