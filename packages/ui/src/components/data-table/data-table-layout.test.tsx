import type { ColumnDef } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "../badge.js";

import { DataTable } from "./data-table.js";

interface User {
  id: string;
  name: string;
  kind: string;
  roles: string[];
  active: boolean;
}

const USERS: User[] = [
  { id: "1", name: "Admin Contoh", kind: "Pegawai", roles: ["Admin Sekolah"], active: true },
];

/** A screen that sets no `meta.card`: every column but the name is a labelled field. */
const fieldColumns: ColumnDef<User>[] = [
  { accessorKey: "name", header: "Nama" },
  { accessorKey: "kind", header: "Jenis" },
  {
    id: "roles",
    header: "Peran",
    meta: { skeleton: "badge" },
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1" data-testid="roles">
        {row.original.roles.map((role) => (
          <Badge key={role}>{role}</Badge>
        ))}
      </div>
    ),
  },
  {
    id: "status",
    header: "Status",
    meta: { skeleton: "badge" },
    cell: ({ row }) => <Badge>{row.original.active ? "Aktif" : "Nonaktif"}</Badge>,
  },
  { id: "actions", header: "Aksi", cell: () => <button type="button">Ubah</button> },
];

const shapedColumns: ColumnDef<User>[] = [
  { accessorKey: "name", header: "Nama", meta: { card: "title", skeleton: "avatar" } },
  { accessorKey: "kind", header: "Jenis", meta: { card: "subtitle" } },
  { id: "status", header: "Status", meta: { card: "meta", skeleton: "badge" }, cell: () => null },
  { id: "note", header: "Catatan", cell: () => null },
  { id: "actions", header: "Aksi", cell: () => null },
];

function card(): HTMLElement {
  const [item] = screen.getAllByRole("listitem");
  if (!item) throw new Error("Missing card");
  return item;
}

describe("DataTable phone cards", () => {
  it("lines every field value up on the right, a cell's own badge row included", () => {
    render(<DataTable mode="local" data={USERS} columns={fieldColumns} />);
    const values = within(card()).getAllByRole("definition");
    expect(values).toHaveLength(3);
    for (const value of values) {
      // The value box is pushed to the end and is only as wide as its content.
      expect(value).toHaveClass("flex", "flex-1", "justify-end");
      expect(value.firstElementChild).toHaveClass("text-right");
    }
    const roles = within(card()).getByTestId("roles");
    expect(roles.closest("dd")).toBe(values[1]);
    expect(roles.parentElement).toBe(values[1]?.firstElementChild);
  });

  it("keeps the card dense: no rule between the title and the fields, 12px above and below", () => {
    render(<DataTable mode="local" data={USERS} columns={fieldColumns} />);
    const list = within(card()).getAllByRole("term")[0]?.closest("dl");
    expect(list).not.toHaveClass("border-t");
    expect(list?.parentElement?.parentElement).toHaveClass("py-3");
  });
});

describe("DataTable loading placeholders", () => {
  function loadingRow(): HTMLTableCellElement[] {
    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    if (!row) throw new Error("Missing placeholder row");
    return Array.from(row.querySelectorAll("td"));
  }

  it("shape each table cell like the content that replaces it", () => {
    render(<DataTable mode="local" data={[]} columns={shapedColumns} isLoading />);
    const [name, kind, status, note, actions] = loadingRow();
    // An avatar beside a name over a username.
    expect(name?.querySelectorAll("[data-slot=skeleton]")).toHaveLength(3);
    expect(name?.querySelector("[data-slot=skeleton]")).toHaveClass("size-8", "rounded-full");
    // A bar on one line of the cell's text.
    expect(kind?.querySelector("[data-slot=skeleton]")?.parentElement).toHaveClass("h-lh");
    expect(note?.querySelector("[data-slot=skeleton]")?.parentElement).toHaveClass("h-lh");
    // A pill.
    expect(status?.querySelector("[data-slot=skeleton]")).toHaveClass("h-6", "rounded-full");
    // The actions keep their buttons' room, without a shimmer.
    expect(actions?.querySelector("[data-slot=skeleton]")).toBeNull();
    expect(actions?.firstElementChild).toHaveClass("size-8", "pointer-coarse:size-11");
  });

  it("draw one placeholder per visible column", () => {
    render(<DataTable mode="local" data={[]} columns={shapedColumns} isLoading />);
    expect(loadingRow()).toHaveLength(screen.getAllByRole("columnheader").length);
  });

  it("give the phone cards the loaded card's structure", () => {
    const { container } = render(
      <DataTable mode="local" data={[]} columns={shapedColumns} isLoading />,
    );
    const busy = container.querySelector("[aria-busy=true]");
    const placeholder = busy?.firstElementChild;
    if (!placeholder) throw new Error("Missing placeholder card");
    expect(placeholder).toHaveClass("px-4", "py-3", "gap-1.5");
    const bars = placeholder.querySelectorAll("[data-slot=skeleton]");
    // Avatar and two lines, the subtitle, one meta pill, one field (label and value).
    expect(bars).toHaveLength(3 + 1 + 1 + 2);
    expect(placeholder.querySelector(".rounded-full.h-6")).not.toBeNull();
  });
});

describe("DataTable header band", () => {
  it("uses the header surface, not the sunken one, loaded and loading", () => {
    const { rerender } = render(<DataTable mode="local" data={USERS} columns={fieldColumns} />);
    const headRow = () => within(screen.getByRole("table")).getAllByRole("row")[0];
    expect(headRow()).toHaveClass("bg-surface-header");
    expect(headRow()).not.toHaveClass("bg-surface-sunken");
    rerender(<DataTable mode="local" data={[]} columns={fieldColumns} isLoading />);
    expect(headRow()).toHaveClass("bg-surface-header");
  });
});

describe("DataTable scroller", () => {
  /**
   * The nearest positioned box at or above `element`, by its classes
   * (jsdom computes no layout): what an absolutely positioned label inside
   * it is placed against and clipped by.
   */
  function containingBlock(element: HTMLElement): HTMLElement | null {
    let box = element.parentElement;
    while (box && !/(?:^|\s)(?:relative|sticky|absolute|fixed)(?:\s|$)/.test(box.className)) {
      box = box.parentElement;
    }
    return box;
  }

  // The fines list at 768px: the hidden "Aksi" header sat past the card's
  // edge in the unscrolled table and scrolled the whole page sideways.
  it("contains the hidden actions header, so it cannot widen the page", () => {
    render(<DataTable mode="local" data={USERS} columns={fieldColumns} />);
    const label = within(screen.getByRole("table")).getByText("Aksi");
    expect(label).toHaveClass("sr-only");
    const block = containingBlock(label);
    expect(block).not.toBeNull();
    // The scroller itself, or a box inside it, holds the label.
    const scroller = screen.getByRole("table").closest(".overflow-x-auto");
    expect(scroller).toHaveClass("relative");
    expect(scroller?.contains(block)).toBe(true);
  });
});

describe("DataTable toolbar on a phone", () => {
  it("draws no phone row for a table with nothing but the column menu", () => {
    render(<DataTable mode="local" data={USERS} columns={fieldColumns} searchable={false} />);
    // The toolbar: hidden below md, still offering density and columns from md up.
    const toolbar = screen
      .getByRole("button", { name: "Kolom tampil" })
      .closest("[data-slot=data-table-toolbar]");
    expect(toolbar).toHaveClass("max-md:hidden");
  });

  it("keeps the phone row while there is a search to type in", () => {
    render(<DataTable mode="local" data={USERS} columns={fieldColumns} />);
    const toolbar = screen.getByRole("searchbox").closest("[data-slot=data-table-toolbar]");
    expect(toolbar).not.toHaveClass("max-md:hidden");
    // The column menu sits beside the search box.
    expect(screen.getByRole("button", { name: "Opsi tabel" })).toBeInTheDocument();
  });

  it("leaves out the phone column menu when there is no search box to sit beside", () => {
    render(
      <DataTable
        mode="local"
        data={USERS}
        columns={fieldColumns}
        searchable={false}
        filters={[{ id: "kind", label: "Jenis", value: "", onChange: () => undefined }]}
      />,
    );
    // Otherwise it wraps onto a row of its own, a lone "..." above the pills.
    expect(screen.queryByRole("button", { name: "Opsi tabel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kolom tampil" })).toBeInTheDocument();
  });

  it("runs the pill row into the gutter so the next pill peeks in", () => {
    const { container } = render(
      <DataTable
        mode="local"
        data={USERS}
        columns={fieldColumns}
        filters={[{ id: "kind", label: "Jenis", value: "", onChange: () => undefined }]}
      />,
    );
    // The "Jenis" column's sort button shares the filter's name: find the pill in the toolbar.
    const toolbar = container.querySelector<HTMLElement>("[data-slot=data-table-toolbar]");
    if (!toolbar) throw new Error("Missing toolbar");
    const strip = within(toolbar).getByRole("button", { name: "Jenis" }).closest(".scroll-fade-x");
    expect(strip).toHaveClass("max-md:-mx-4", "max-md:px-4", "max-md:basis-[calc(100%+2rem)]");
  });
});

describe("DataTable toolbar in a narrow pane", () => {
  // A class's roster sits in a detail card beside the class list. Keyed to
  // the screen, the toolbar turned into its one row at 768px, and its
  // 288px search ran past a 216px card and scrolled the page sideways.
  it("lays its one row out by its own width, never by the screen's alone", () => {
    const { container } = render(
      <DataTable
        mode="local"
        data={USERS}
        columns={fieldColumns}
        filters={[{ id: "kind", label: "Jenis", value: "", onChange: () => undefined }]}
        toolbarActions={<button type="button">Tambah</button>}
      />,
    );
    const toolbar = container.querySelector<HTMLElement>("[data-slot=data-table-toolbar]");
    if (!toolbar) throw new Error("Missing toolbar");
    expect(toolbar).toHaveClass("@container/table-toolbar");
    const row = toolbar.firstElementChild;
    expect(row).toHaveClass("flex", "flex-wrap", "md:@md/table-toolbar:items-start");

    // Every control's row placement waits for both md of screen (the
    // table, not the phone cards) and 28rem of the toolbar's own width.
    const search = within(toolbar).getByRole("searchbox").closest(".order-1");
    const pills = within(toolbar).getByRole("button", { name: "Jenis" }).closest(".order-4");
    const actions = within(toolbar).getByRole("button", { name: "Tambah" }).parentElement;
    const viewOptions = within(toolbar)
      .getByRole("button", { name: "Kolom tampil" })
      .closest(".order-2");
    expect(search).toHaveClass("flex-1", "md:@md/table-toolbar:w-72", "md:@2xl/table-toolbar:w-80");
    expect(pills).toHaveClass("basis-full", "md:@md/table-toolbar:order-2");
    expect(actions).toHaveClass("basis-full", "md:@md/table-toolbar:basis-auto");
    expect(viewOptions).toHaveClass("ml-auto", "md:@md/table-toolbar:ml-0");
    // (The pills still wrap from md and scroll on a phone: that is how
    // their own row behaves, not where it goes.)
    for (const control of [row, search, pills, actions, viewOptions]) {
      const screenKeyed = Array.from(control?.classList ?? []).filter((name) =>
        /^(?:sm|md|lg|xl|2xl):(?:w-|min-w-|flex-(?!wrap)|basis-|order-|ml-|items-)/.test(name),
      );
      expect(screenKeyed).toEqual([]);
    }
  });
});

describe("DataTable view options", () => {
  it("are left out over an empty table that no search or filter emptied", () => {
    render(<DataTable mode="local" data={[]} columns={fieldColumns} />);
    expect(screen.queryByRole("button", { name: /^Kepadatan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kolom tampil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opsi tabel" })).not.toBeInTheDocument();
  });

  it("stay while a filter has emptied the table, so the toolbar does not jump", () => {
    render(
      <DataTable
        mode="local"
        data={[]}
        columns={fieldColumns}
        filters={[{ id: "kind", label: "Jenis", value: "a", onChange: () => undefined }]}
      />,
    );
    expect(screen.getByRole("button", { name: /^Kepadatan/ })).toBeInTheDocument();
  });

  it("stay while the rows load", () => {
    render(<DataTable mode="local" data={[]} columns={fieldColumns} isLoading />);
    expect(screen.getByRole("button", { name: /^Kepadatan/ })).toBeInTheDocument();
  });

  it("are left out on request, and the toolbar with nothing else in it is not drawn", () => {
    const { container } = render(
      <DataTable
        mode="local"
        data={USERS}
        columns={fieldColumns}
        searchable={false}
        viewOptions={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Kepadatan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kolom tampil" })).not.toBeInTheDocument();
    expect(container.querySelector("[data-slot=data-table-toolbar]")).toBeNull();
  });

  it("offer no column menu for a single column that could be hidden", () => {
    render(
      <DataTable
        mode="local"
        data={USERS}
        columns={[
          { accessorKey: "name", header: "Nama" },
          { id: "actions", header: "Aksi", cell: () => null },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /^Kepadatan/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kolom tampil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opsi tabel" })).not.toBeInTheDocument();
  });
});
