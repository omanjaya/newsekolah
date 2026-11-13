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

  it("keeps loaded rows after a failed refetch, under an alert in the caller's words", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <DataTable
        mode="local"
        data={ROWS}
        columns={columns}
        error="Server sedang sibuk."
        onRetry={onRetry}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Data gagal dimuat");
    expect(alert).toHaveTextContent("Server sedang sibuk.");
    expect(within(screen.getByRole("table")).getByText("Siswa 0")).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Coba lagi" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <DataTable
        mode="local"
        data={ROWS}
        columns={columns}
        error="Server sedang sibuk."
        onRetry={onRetry}
        retrying
      />,
    );
    expect(
      within(screen.getByRole("alert")).getByRole("button", { name: /Coba lagi/ }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("shows a retry in flight on the error state", () => {
    render(<DataTable mode="local" data={[]} columns={columns} error onRetry={vi.fn()} retrying />);
    expect(
      within(screen.getByRole("alert")).getByRole("button", { name: /Coba lagi/ }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("renders a caller's EmptyState inline inside the table card", () => {
    render(
      <DataTable
        mode="local"
        data={[]}
        columns={columns}
        emptyState={<EmptyState title="Belum ada siswa" />}
      />,
    );
    const [title] = screen.getAllByText("Belum ada siswa");
    const root = title?.closest("[data-slot=data-table-empty] > *");
    if (!(root instanceof HTMLElement)) throw new Error("Missing empty state");
    // The inline variant: no frame of its own, the inline spacing.
    expect(root).toHaveClass("py-8");
    expect(root).not.toHaveClass("border");
  });

  it("says there is nothing yet when the caller gave no empty state", () => {
    render(<DataTable mode="local" data={[]} columns={columns} />);
    expect(screen.getAllByText("Belum ada data").length).toBeGreaterThan(0);
  });

  it("offers to clear a local search that matched nothing", async () => {
    render(<DataTable mode="local" data={ROWS} columns={columns} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Cari" }), "tidak ada");
    // Past the 300ms typing debounce.
    const [title] = await screen.findAllByText("Tidak ada hasil", undefined, { timeout: 2000 });
    const slot = title?.closest<HTMLElement>("[data-slot=data-table-empty]");
    if (!slot) throw new Error("Missing empty slot");
    await userEvent.click(within(slot).getByRole("button", { name: "Hapus pencarian" }));
    expect(await screen.findAllByText("Siswa 0")).not.toHaveLength(0);
    expect(screen.getByRole("searchbox", { name: "Cari" })).toHaveValue("");
  });
});

describe("DataTable footer", () => {
  it("counts rows and pages, and keeps the page size picker after a size that fits every row", async () => {
    render(<DataTable mode="local" data={ROWS} columns={columns} defaultPageSize={10} />);
    expect(screen.getByText("1–10 dari 12")).toBeInTheDocument();
    const pageSize = screen.getByRole("combobox", { name: "Baris per halaman" });
    expect(pageSize).toHaveTextContent("10");
    await userEvent.click(pageSize);
    await userEvent.click(screen.getByRole("option", { name: "25" }));
    expect(screen.getByText("12 data")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ke halaman berikutnya" })).not.toBeInTheDocument();

    // One page now, but the way back to 10 is still there.
    const stillThere = screen.getByRole("combobox", { name: "Baris per halaman" });
    await userEvent.click(stillThere);
    await userEvent.click(screen.getByRole("option", { name: "10" }));
    expect(screen.getByText("1–10 dari 12")).toBeInTheDocument();
  });

  it("offers no page size when every row fits the smallest one", () => {
    render(<DataTable mode="local" data={ROWS.slice(0, 8)} columns={columns} />);
    expect(screen.getByText("8 data")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Baris per halaman" })).not.toBeInTheDocument();
  });

  it("keeps the way back on an empty server page past the first", async () => {
    const onPaginationChange = vi.fn();
    render(
      <DataTable
        mode="server"
        data={[]}
        columns={columns}
        rowCount={20}
        pagination={{ pageIndex: 2, pageSize: 10 }}
        onPaginationChange={onPaginationChange}
        emptyState={<EmptyState title="Belum ada siswa" />}
      />,
    );
    const previous = screen.getByRole("button", { name: "Ke halaman sebelumnya" });
    expect(screen.getByText("20 data")).toBeInTheDocument();
    expect(screen.queryByText(/Halaman 3/)).not.toBeInTheDocument();
    await userEvent.click(previous);
    expect(onPaginationChange).toHaveBeenCalled();
  });

  it("keeps cursor previous on an empty page", () => {
    render(
      <DataTable
        mode="cursor"
        data={[]}
        columns={columns}
        cursorPagination={{
          hasPrevious: true,
          hasNext: false,
          onPrevious: vi.fn(),
          onNext: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Ke halaman sebelumnya" })).toBeEnabled();
  });

  it("stays mounted while the next page loads, holding previous and next still", async () => {
    const onPaginationChange = vi.fn();
    const props = {
      mode: "server" as const,
      columns,
      rowCount: 30,
      pagination: { pageIndex: 1, pageSize: 10 },
      onPaginationChange,
    };
    const { rerender } = render(<DataTable {...props} data={ROWS.slice(0, 10)} />);
    const next = screen.getByRole("button", { name: "Ke halaman berikutnya" });
    next.focus();
    rerender(<DataTable {...props} data={[]} isLoading />);
    const held = screen.getByRole("button", { name: "Ke halaman berikutnya" });
    expect(held).toBe(next);
    expect(held).toHaveFocus();
    expect(held).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    expect(onPaginationChange).not.toHaveBeenCalled();
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

  it('treats a data column named "action" as data, not as the row actions', () => {
    const auditColumns: ColumnDef<Row>[] = [
      { accessorKey: "name", header: "Entitas" },
      { id: "action", accessorKey: "role", header: "Aksi" },
    ];
    render(<DataTable mode="local" data={ROWS.slice(0, 1)} columns={auditColumns} />);
    const header = screen.getByRole("columnheader", { name: "Aksi" });
    expect(header).not.toHaveClass("w-px");
    expect(header).toHaveClass("text-left");
    expect(within(header).getByText("Aksi")).not.toHaveClass("sr-only");
    const cell = within(screen.getByRole("table")).getByRole("cell", { name: "Siswa" });
    expect(cell).not.toHaveClass("w-px");
    const [card] = cards();
    if (!card) throw new Error("Missing card");
    expect(
      within(card)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Aksi"]);
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
