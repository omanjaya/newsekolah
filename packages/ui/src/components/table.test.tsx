import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table.js";

function renderTable(density?: "normal" | "compact") {
  return render(
    <Table density={density}>
      <TableCaption>Koleksi buku</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Judul</TableHead>
          <TableHead>Eksemplar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Matematika untuk SD</TableCell>
          <TableCell className="text-right tabular-nums">12</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Sejarah Indonesia</TableCell>
          <TableCell className="text-right tabular-nums">5</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("Table", () => {
  it("renders a table with caption, header and body rows", () => {
    renderTable();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Koleksi buku")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Judul" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Matematika untuk SD" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("defaults to normal density's cell padding", () => {
    renderTable();
    const cell = screen.getByRole("cell", { name: "Matematika untuk SD" });
    expect(cell.className).toContain("px-4");
    expect(cell.className).toContain("py-3");
  });

  it("applies compact density's tighter cell padding", () => {
    renderTable("compact");
    const cell = screen.getByRole("cell", { name: "Matematika untuk SD" });
    expect(cell.className).toContain("px-3");
    expect(cell.className).toContain("py-2");
  });

  it("forwards a className to a cell alongside its density padding", () => {
    renderTable();
    const numericCell = screen.getByRole("cell", { name: "12" });
    expect(numericCell.className).toContain("text-right");
    expect(numericCell.className).toContain("tabular-nums");
  });

  it("has no axe violations", async () => {
    const { container } = renderTable();
    await expectNoAxeViolations(container);
  });
});
