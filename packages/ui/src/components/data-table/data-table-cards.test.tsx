import type { ColumnDef } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./data-table.js";

interface Title {
  id: string;
  title: string;
  author: string;
}

const TITLES: Title[] = [{ id: "1", title: "Laskar Pelangi", author: "Andrea Hirata" }];

const columns: ColumnDef<Title>[] = [
  {
    accessorKey: "title",
    header: "Judul",
    meta: { card: "title" },
    cell: ({ row }) => <a href={`/library/catalogue/${row.original.id}`}>{row.original.title}</a>,
  },
  { accessorKey: "author", header: "Penulis", meta: { card: "subtitle" } },
];

function card(): HTMLElement {
  const [item] = screen.getAllByRole("listitem");
  if (!item) throw new Error("Missing card");
  return item;
}

describe("DataTable phone cards", () => {
  // A linked title took a 44px line box: about 33px between it and its
  // subtitle instead of 6px, and a linked name sat lower than a plain one.
  it("gives a linked title a 44px target without making its line taller", () => {
    render(
      <DataTable mode="local" data={TITLES} columns={columns} onRowActivate={() => undefined} />,
    );
    const link = within(card()).getByRole("link", { name: "Laskar Pelangi" });
    const title = link.parentElement;
    expect(title).not.toHaveClass("[&_a]:min-h-11");
    expect(title).toHaveClass(
      "[&_a]:relative",
      "[&_a]:z-10",
      "[&_a]:after:absolute",
      "[&_a]:after:top-1/2",
      "[&_a]:after:h-11",
    );
  });

  it("dips while its own overlay is pressed, never for a lifted control", () => {
    render(
      <DataTable mode="local" data={TITLES} columns={columns} onRowActivate={() => undefined} />,
    );
    expect(card()).toHaveClass(
      "has-[>button:active]:scale-(--motion-scale-press)",
      "has-[>button:active]:duration-instant",
    );
    // The overlay is the card's direct child, the selector's `>button`.
    expect(card().querySelector(":scope > button")).not.toBeNull();
  });
});
