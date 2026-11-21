import { render, screen } from "@testing-library/react";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "../test/axe.js";

import { FilterBar, type FilterBarRowFrom } from "./filter-bar.js";
import { SearchInput } from "./search-input.js";
import { SegmentedControl } from "./segmented-control.js";

const options = [
  { value: "all", label: "Semua" },
  { value: "onSite", label: "Di sekolah", count: 8 },
  { value: "expected", label: "Terjadwal", count: 0 },
];

function Board({ rowFrom }: { rowFrom?: FilterBarRowFrom }) {
  return (
    <FilterBar
      rowFrom={rowFrom}
      search={<SearchInput aria-label="Cari nama atau instansi" defaultValue="" />}
    >
      <SegmentedControl aria-label="Tampilkan" options={options} defaultValue="all" />
    </FilterBar>
  );
}

/** The Tailwind theme sizes the bar's container queries read. */
const THEME = `@theme {
  --spacing: 0.25rem;
  --container-sm: 24rem; --container-md: 28rem; --container-lg: 32rem;
  --container-xl: 36rem; --container-2xl: 42rem; --container-3xl: 48rem;
}
@tailwind utilities;`;

async function compiledCss(classes: string[]): Promise<string> {
  const compiler = await compile(THEME);
  return compiler.build(classes);
}

function classesOf(root: Element): string[] {
  return [root, ...Array.from(root.querySelectorAll("*"))].flatMap((el) =>
    Array.from(el.classList),
  );
}

/** The rules of one `@container filter-bar (...)` block, up to its closing brace. */
function containerBlock(css: string, condition: string): string {
  const start = css.indexOf(`@container filter-bar (${condition})`);
  if (start === -1) return "";
  let depth = 0;
  for (let at = css.indexOf("{", start); at < css.length; at += 1) {
    if (css[at] === "{") depth += 1;
    if (css[at] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, at + 1);
  }
  return css.slice(start);
}

describe("FilterBar", () => {
  it("lays its controls out by its own width, never the screen's", () => {
    // A toolbar that turned into a row at 640px of screen put a 288px
    // search beside the filter strip in the 480px column a 768px tablet
    // leaves beside the sidebar: the strip got 180px of its 373px and hid
    // "Terjadwal" past its edge.
    const { container } = render(<Board />);
    const bar = container.firstElementChild;
    if (!bar) throw new Error("no bar");
    expect(bar).toHaveAttribute("data-slot", "filter-bar");
    // A container cannot size itself by its content: it fills its line.
    expect(bar).toHaveClass("@container/filter-bar", "w-full", "min-w-0");

    const viewportVariant = /(^|:)(max-)?(sm|md|lg|xl|2xl):/;
    const ownClasses = [
      bar,
      bar.firstElementChild,
      bar.querySelector("[data-slot=filter-bar-search]"),
    ].flatMap((el) => Array.from(el?.classList ?? []));
    expect(ownClasses.filter((name) => viewportVariant.test(name))).toEqual([]);
  });

  it("stacks its controls at full width below rowFrom and wraps a row from it", async () => {
    const { container } = render(<Board />);
    const row = container.querySelector("[data-slot=filter-bar-row]");
    expect(row).toHaveClass(
      "flex",
      "flex-col",
      "gap-2",
      "@max-xl/filter-bar:*:w-full",
      "@xl/filter-bar:flex-row",
      "@xl/filter-bar:flex-wrap",
      "@xl/filter-bar:items-center",
    );

    // The classes are real Tailwind rules keyed to the bar's container.
    const css = await compiledCss(classesOf(container));
    const stacked = containerBlock(css, "width < 36rem");
    expect(stacked).toMatch(/> \*\)\s*\{\s*width: 100%;/);
    const wide = containerBlock(css, "width >= 36rem");
    expect(wide).toContain("flex-direction: row;");
    expect(wide).toContain("flex-wrap: wrap;");
    expect(wide).toContain("align-items: center;");
  });

  it("gives the search 12 to 20rem of a row and the full width when stacked", async () => {
    const { container } = render(<Board rowFrom="2xl" />);
    const search = container.querySelector("[data-slot=filter-bar-search]");
    expect(search).toContainElement(screen.getByRole("searchbox"));
    expect(search).toHaveClass(
      "min-w-0",
      "@2xl/filter-bar:min-w-48",
      "@2xl/filter-bar:flex-1",
      "@2xl/filter-bar:max-w-80",
    );
    expect(container.querySelector("[data-slot=filter-bar-row]")).toHaveClass(
      "@max-2xl/filter-bar:*:w-full",
      "@2xl/filter-bar:flex-row",
    );

    const css = await compiledCss(classesOf(container));
    const wide = containerBlock(css, "width >= 42rem");
    expect(wide).toContain("min-width: calc(var(--spacing) * 48);");
    expect(wide).toContain("max-width: calc(var(--spacing) * 80);");
    expect(containerBlock(css, "width < 42rem")).toContain("width: 100%;");
  });

  it.each<FilterBarRowFrom>(["sm", "md", "lg", "xl", "2xl", "3xl"])(
    "compiles every class it sets for rowFrom %s",
    async (rowFrom) => {
      const { container } = render(<Board rowFrom={rowFrom} />);
      const bar = container.firstElementChild;
      if (!bar) throw new Error("no bar");
      const own = [
        bar,
        bar.firstElementChild,
        bar.querySelector("[data-slot=filter-bar-search]"),
      ].flatMap((el) => Array.from(el?.classList ?? []));
      for (const name of own) {
        const css = await compiledCss([name]);
        expect(css.trim(), name).not.toBe("");
      }
    },
  );

  it("puts the search first and leaves its slot out when there is none", () => {
    const { container, rerender } = render(<Board />);
    const row = container.querySelector("[data-slot=filter-bar-row]");
    expect(row?.firstElementChild).toHaveAttribute("data-slot", "filter-bar-search");
    expect(row?.lastElementChild).toContainElement(screen.getByRole("radiogroup"));

    rerender(
      <FilterBar>
        <SegmentedControl aria-label="Tampilkan" options={options} defaultValue="all" />
      </FilterBar>,
    );
    expect(container.querySelector("[data-slot=filter-bar-search]")).toBeNull();
    // A search shown on a condition (`canSearch && <SearchInput />`) leaves no empty slot.
    rerender(
      <FilterBar search={false}>
        <SegmentedControl aria-label="Tampilkan" options={options} defaultValue="all" />
      </FilterBar>,
    );
    expect(container.querySelector("[data-slot=filter-bar-search]")).toBeNull();
  });

  it("lets a filter strip fill the width a stacked bar gives it", () => {
    render(<Board />);
    // The bar stretches the strip's track; the segments then share it.
    expect(screen.getByRole("radiogroup")).toHaveClass("w-full", "min-w-max");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Board />);
    await expectNoAxeViolations(container);
  });
});
