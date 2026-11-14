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
  it("is the sunken tint in light and a step above the card in dark", async () => {
    const css = await compiledFormsDataCss(["bg-surface-header"]);
    expect(css).toContain("background-color: var(--color-surface-header)");
    expect(css).toMatch(/:root \{\s*--color-surface-header: var\(--color-surface-sunken\);/);
    // Tailwind puts the plain card colour first for a browser without
    // color-mix, then the lift; never the sunken surface in dark.
    const lift =
      "--color-surface-header: color-mix(in srgb, var(--color-surface) 96%, var(--color-fg))";
    const darkRule = (start: string) => {
      const from = css.indexOf(start);
      return css.slice(from, css.indexOf("}\n  }", from));
    };
    for (const selector of ['[data-theme="dark"] {', ':root:not([data-theme="light"]) {']) {
      expect(darkRule(selector)).toContain(lift);
      expect(darkRule(selector)).not.toContain("sunken");
    }
  });
});
