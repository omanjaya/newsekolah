import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A box that scrolls sideways is positioned (`relative`), so it is the
 * containing block of everything absolutely positioned inside it.
 *
 * Overflow clips only the descendants whose containing block is the
 * scroller or inside it. A visually hidden label (`sr-only`, which is
 * `position: absolute`) in a table whose cells are all static took the
 * page itself as its containing block: it sat at its place in the
 * unscrolled table, past the card's edge, and the fines list at 768px
 * scrolled the whole page 34px sideways for a 1px "Aksi" header. Any
 * screen-reader label, icon button or overlay inside a scroller can do the
 * same, so every scroller is positioned, not every cell that might hold
 * one.
 *
 * Checked per class string: the literal that makes a box scroll
 * (`overflow-x-auto`, `overflow-auto`, at any variant) also positions it.
 */
const ROOT = join(__dirname, "..");
const UI = join(ROOT, "..", "..", "packages", "ui", "src", "components");
const SCANNED = [join(ROOT, "features"), join(ROOT, "components"), join(ROOT, "app"), UI];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** A class that lets a box scroll sideways, at any variant (`md:overflow-auto`). */
const SCROLLS_X = /(?:^|\s)(?:[^\s:]+:)*overflow-(?:x-)?(?:auto|scroll)(?=\s|$)/;
/** A class that positions the box, at any variant. */
const POSITIONED = /(?:^|\s)(?:[^\s:]+:)*(?:relative|absolute|fixed|sticky)(?=\s|$)/;
/** String literals: double-quoted, single-quoted and template text. */
const LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function unpositionedScrollers(): string[] {
  return SCANNED.flatMap(sourceFiles).flatMap((path) => {
    const source = withoutComments(readFileSync(path, "utf8"));
    return Array.from(source.matchAll(LITERAL))
      .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
      .filter((classes) => SCROLLS_X.test(classes) && !POSITIONED.test(classes))
      .map((classes) => `${relative(join(ROOT, "..", ".."), path)}: "${classes}"`);
  });
}

describe("scroller containment", () => {
  it("positions every box that scrolls sideways", () => {
    expect(unpositionedScrollers()).toEqual([]);
  });

  it("recognises a scroller with and without its positioning", () => {
    expect(SCROLLS_X.test("hidden overflow-x-auto md:block")).toBe(true);
    expect(SCROLLS_X.test("min-h-0 md:overflow-auto")).toBe(true);
    expect(SCROLLS_X.test("md:overflow-y-auto overflow-hidden")).toBe(false);
    expect(POSITIONED.test("relative hidden overflow-x-auto")).toBe(true);
    expect(POSITIONED.test("peer/strip relative flex")).toBe(true);
    expect(POSITIONED.test("hidden overflow-x-auto md:block")).toBe(false);
  });
});
