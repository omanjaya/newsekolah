import type { ColumnDef } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "../../test/axe.js";
import { EmptyState } from "../empty-state.js";
import { UiLabelsProvider } from "../ui-labels.js";

import { DataTable } from "./data-table.js";

interface Row {
  id: string;
  name: string;
  username: string;
  role: string;
  note: string;
}

const ROWS: Row[] = Array.from({ length: 12 }, (_, index) => ({
  id: String(index),
  name: `Siswa ${index}`,
  username: `siswa${index}`,
  role: index % 2 ? "Guru" : "Siswa",
  note: `Catatan ${index}`,
}));

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Nama", meta: { card: "title" } },
  { accessorKey: "username", header: "Pengguna", meta: { card: "subtitle" } },
  { accessorKey: "role", header: "Peran", meta: { card: "meta" } },
  { accessorKey: "note", header: "Catatan", meta: { card: "hidden" } },
  {
    id: "actions",
    header: "Aksi",
    cell: ({ row }) => <button type="button">Ubah {row.original.name}</button>,
  },
];

function cards(): HTMLElement[] {
  return screen.getAllByRole("listitem");
}

describe("DataTable error state", () => {
  it("shows a failed load with a retry instead of the empty state", async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        mode="local"
        data={[]}
        columns={columns}
        error={Object.assign(new Error("fetch failed"), { code: "NETWORK" })}
        onRetry={onRetry}
        emptyState={<EmptyState title="Belum ada siswa" />}
      />,
    );
    expect(screen.queryByText("Belum ada siswa")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Data gagal dimuat");
    expect(alert).toHaveTextContent("Kode galat: NETWORK");
    // The raw Error message is never shown to the reader.
    expect(alert).not.toHaveTextContent("fetch failed");
    await userEvent.click(within(alert).getByRole("button", { name: "Coba lagi" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("uses a caller's own words as the description", () => {
    render(<DataTable mode="local" data={ROWS} columns={columns} error="Server sedang sibuk." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server sedang sibuk.");
    expect(screen.queryByText("Siswa 0")).not.toBeInTheDocument();
  });

  it("strips the frame off the empty state inside the table card", () => {
    render(
      <DataTable
        mode="local"
        data={[]}
        columns={columns}
        emptyState={<EmptyState title="Belum ada siswa" />}
      />,
    );
    const slot = screen.getAllByText("Belum ada siswa")[0]?.closest("[data-slot=data-table-empty]");
    expect(slot).toHaveClass("[&>*]:border-0", "[&>*]:rounded-none");
  });
});

describe("DataTable footer", () => {
  it("counts rows and pages, and offers page sizes once there is more than one page", async () => {
    render(<DataTable mode="local" data={ROWS} columns={columns} defaultPageSize={10} />);
    expect(screen.getByText("1–10 dari 12")).toBeInTheDocument();
    const pageSize = screen.getByRole("combobox", { name: "Baris per halaman" });
    expect(pageSize).toHaveTextContent("10");
    await userEvent.click(pageSize);
    await userEvent.click(screen.getByRole("option", { name: "25" }));
    expect(screen.getByText("12 data")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ke halaman berikutnya" })).not.toBeInTheDocument();
  });

  it("renders cursor paging in the same footer, with the shown rows", async () => {
    const onNext = vi.fn();
    render(
      <DataTable
        mode="cursor"
        data={ROWS.slice(0, 10)}
        columns={columns}
        cursorPagination={{
          hasPrevious: true,
          hasNext: true,
          onPrevious: vi.fn(),
          onNext,
          page: 2,
          pageSize: 10,
        }}
      />,
    );
    expect(screen.getByText("Baris 11–20")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ke halaman berikutnya" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("hides cursor navigation when there is nowhere to go", () => {
    render(
      <DataTable
        mode="cursor"
        data={ROWS.slice(0, 3)}
        columns={columns}
        cursorPagination={{
          hasPrevious: false,
          hasNext: false,
          onPrevious: vi.fn(),
          onNext: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("3 data")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ke halaman sebelumnya" })).not.toBeInTheDocument();
  });

  it("takes its words from UiLabels", () => {
    render(
      <UiLabelsProvider
        labels={{
          tableRange: (from, to, total) => `${from}-${to} of ${total}`,
          tableSearchPlaceholder: "Search",
        }}
      >
        <DataTable mode="local" data={ROWS} columns={columns} defaultPageSize={10} />
      </UiLabelsProvider>,
    );
    expect(screen.getByText("1-10 of 12")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeInTheDocument();
  });
});

describe("DataTable rows and cards", () => {
  it("opens a row on click, but not from a control inside it", async () => {
    const onRowActivate = vi.fn();
    render(
      <DataTable
        mode="local"
        data={ROWS.slice(0, 2)}
        columns={columns}
        onRowActivate={onRowActivate}
      />,
    );
    const table = screen.getByRole("table");
    await userEvent.click(within(table).getByText("Siswa 1"));
    expect(onRowActivate).toHaveBeenCalledWith(ROWS[1]);
    onRowActivate.mockClear();
    await userEvent.click(within(table).getByRole("button", { name: "Ubah Siswa 0" }));
    expect(onRowActivate).not.toHaveBeenCalled();
  });

  it("builds a card's title, subtitle and meta from column meta, and leaves hidden columns out", () => {
    render(<DataTable mode="local" data={ROWS.slice(0, 1)} columns={columns} />);
    const [card] = cards();
    if (!card) throw new Error("Missing card");
    expect(within(card).getByText("Siswa 0")).toHaveClass("font-semibold");
    expect(within(card).getByText("siswa0")).toHaveClass("text-fg-muted");
    expect(within(card).getByText("Siswa")).toBeInTheDocument();
    expect(within(card).queryByText("Catatan 0")).not.toBeInTheDocument();
    // Meta columns are inline, without a label row.
    expect(within(card).queryByRole("term")).not.toBeInTheDocument();
  });

  it("right-aligns the actions column and keeps its header for assistive tech only", () => {
    render(<DataTable mode="local" data={ROWS.slice(0, 1)} columns={columns} />);
    const header = screen.getByRole("columnheader", { name: "Aksi" });
    expect(header).toHaveClass("text-right");
    expect(within(header).getByText("Aksi")).toHaveClass("sr-only");
  });

  it("puts the table's own actions in the toolbar", () => {
    render(
      <DataTable
        mode="local"
        data={ROWS}
        columns={columns}
        toolbarActions={<button type="button">Tambah siswa</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Tambah siswa" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <DataTable mode="local" data={ROWS} columns={columns} defaultPageSize={5} />,
    );
    await expectNoAxeViolations(container);
  });
});
