import { colors } from "@newsekolah/ui-tokens/dist/tokens.ts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";
import { compiledFormsDataCss } from "../test/forms-data-css.js";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
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

  it("gives a column header the band's padding with room for several lines", () => {
    renderTable("compact");
    const header = screen.getByRole("columnheader", { name: "Judul" });
    expect(header).toHaveAttribute("scope", "col");
    expect(header).toHaveClass("px-3", "py-2", "h-10", "shadow-[inset_0_-1px_0_var(--color-line)]");
  });

  it("heads a body row like a cell: its padding, wrapping, no header rule", () => {
    render(
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>Siswa</TableHead>
            <TableHead>Nilai</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableHead>Ahmad Fauzan Ramadhan Saputra</TableHead>
            <TableCell>88</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableHead>Rata-rata</TableHead>
            <TableCell>88</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );
    const rowHeader = screen.getByRole("rowheader", { name: "Ahmad Fauzan Ramadhan Saputra" });
    expect(rowHeader).toHaveAttribute("scope", "row");
    expect(rowHeader).toHaveClass("px-3", "py-2", "text-left");
    expect(rowHeader).not.toHaveClass("whitespace-nowrap");
    expect(rowHeader).not.toHaveClass("h-10");
    expect(rowHeader.className).not.toContain("shadow-");
    expect(rowHeader.closest("tr")).toHaveClass("data-[state=selected]:bg-state-selected");

    const total = screen.getByRole("rowheader", { name: "Rata-rata" });
    expect(total).toHaveAttribute("scope", "row");
    expect(total.closest("tfoot")).toHaveClass("bg-surface-header");
    expect(total.closest("tr")).toHaveClass("border-t");
  });

  it("keeps a caller's own scope", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableHead scope="col">Kolom</TableHead>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("columnheader", { name: "Kolom" })).toHaveAttribute("scope", "col");
  });

  it("wraps the table in its scrollable card by default, and not when unframed", () => {
    const { container, rerender } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Senin</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.firstElementChild).toHaveClass("overflow-x-auto", "rounded-lg", "border");
    // Positioned, so a visually hidden label in a cell is clipped by the
    // card instead of widening the page past a table wider than it.
    expect(container.firstElementChild).toHaveClass("relative");
    rerender(
      <Table framed={false} density="compact" className="table-fixed">
        <TableBody>
          <TableRow>
            <TableCell>Senin</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const table = screen.getByRole("table");
    expect(container.firstElementChild).toBe(table);
    expect(table).toHaveClass("w-full", "border-collapse", "table-fixed");
    // The density still reaches the cells.
    expect(screen.getByRole("cell", { name: "Senin" }).className).toContain("px-3");
  });

  it("has no axe violations", async () => {
    const { container } = renderTable();
    await expectNoAxeViolations(container);
  });
});

describe("Table header band", () => {
  it("draws the header row and the totals row on the header surface", () => {
    renderTable();
    const [headerRow] = screen.getAllByRole("row");
    expect(headerRow).toHaveClass("bg-surface-header");
    expect(headerRow).not.toHaveClass("bg-surface-sunken");
  });

  // The sunken surface is darker than the page in dark, so a band of it
  // read as a black slot across every table card.
  it("is the sunken tint in light and a step above the card in dark", () => {
    expect(colors.light.surfaceHeader).toBe(colors.light.surfaceSunken);
    const level = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + Number.parseInt(hex.slice(i, i + 2), 16), 0);
    expect(level(colors.dark.surfaceHeader)).toBeGreaterThan(level(colors.dark.surface));
    expect(level(colors.dark.surfaceHeader)).toBeGreaterThan(level(colors.dark.surfaceSunken));
  });

  it("takes the band from the token, not from a stand-in in the stylesheet", async () => {
    const css = await compiledFormsDataCss(["bg-surface-header"]);
    expect(css).not.toContain("--color-surface-header:");
  });
});
