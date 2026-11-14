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
