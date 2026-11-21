import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A toolbar lays its controls out by the room it really has, not by the
 * screen's width. From 768px the 240px sidebar takes its share of the
 * screen, so a toolbar that turned into a row at 640px of screen
 * (`flex-col sm:flex-row`) put a 288px search beside a filter strip in a
 * 480px column: the strip got 180px of its 373 and hid "Terjadwal" past
 * its edge on the visitors board, a flex-1 search was left a sliver beside
 * a class select and a type strip in the inbox, and the loan desk's three
 * modes were squeezed to 52px beside its member search.
 *
 * A search, or a segmented filter beside other controls, therefore sits
 * in a `FilterBar` (packages/ui), which stacks its controls or lets them
 * share a row by its own width, and a control inside one sets its row
 * width with plain classes, never at a screen breakpoint.
 */
const ROOT = join(__dirname, "..");
const SCANNED = [join(ROOT, "features"), join(ROOT, "components")];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });
}

/** A switch to a row at a screen breakpoint: `sm:flex-row`, `md:flex-row`. */
const VIEWPORT_ROW = /(?:^|[\s"'`])(?:max-)?(?:sm|md|lg|xl|2xl):flex-row\b/;
/** Wrapping at any width: a row that wraps moves a control on, never clips it. */
const WRAPS = /(?:^|[\s"'`:])flex-wrap\b/;
/** A control's own row width or placement keyed to a screen breakpoint. */
const VIEWPORT_SIZING =
  /(?:^|[\s"'`])(?:max-)?(?:sm|md|lg|xl|2xl):(?:w-|min-w-|max-w-|flex-|basis-|grow|shrink|ml-auto|mr-auto|self-)/;

interface Found {
  where: string;
  /** The element's opening tag: its own props and classes. */
  tag: string;
  /** The whole element, children included. */
  text: string;
}

const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * The JSX element a line belongs to, from its opening tag to the line that
 * closes it at the same indent (prettier's layout).
 */
function elementAround(lines: string[], at: number): { start: number; tag: string; text: string } {
  let start = at;
  while (start > 0 && !/^\s*<[A-Za-z]/.test(lines[start] ?? "")) start -= 1;
  const indent = indentOf(lines[start] ?? "");
  const first = lines[start] ?? "";
  if (/\/>\s*$/.test(first)) return { start, tag: first, text: first };
  let tagEnd = start;
  while (tagEnd < lines.length && !/>\s*$/.test(lines[tagEnd] ?? "")) tagEnd += 1;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end] ?? "";
    if (indentOf(line) === indent && /^\s*(<\/|\/>)/.test(line)) break;
    end += 1;
  }
  return {
    start,
    tag: lines.slice(start, tagEnd + 1).join("\n"),
    text: lines.slice(start, end + 1).join("\n"),
  };
}

/** Each element whose own classes switch to a row at a screen breakpoint. */
function viewportRows(file: string, source: string): Found[] {
  const lines = source.split("\n");
  const seen = new Set<number>();
  return lines.flatMap((line, index) => {
    if (!VIEWPORT_ROW.test(line)) return [];
    const element = elementAround(lines, index);
    if (seen.has(element.start)) return [];
    seen.add(element.start);
    return [{ where: `${file}:${String(element.start + 1)}`, ...element }];
  });
}

/** Each `<FilterBar>` element in a source. */
function filterBars(file: string, source: string): Found[] {
  const lines = source.split("\n");
  return lines.flatMap((line, index) =>
    /^\s*<FilterBar\b/.test(line)
      ? [{ where: `${file}:${String(index + 1)}`, ...elementAround(lines, index) }]
      : [],
  );
}

const searchInViewportRow = (row: Found): boolean => row.text.includes("<SearchInput");
const stripInRigidViewportRow = (row: Found): boolean =>
  row.text.includes("<SegmentedControl") && !WRAPS.test(row.tag);
const sizedByScreen = (bar: Found): boolean =>
  VIEWPORT_SIZING.test(bar.text) || bar.text.includes('fullWidth="phone"');

const sources = SCANNED.flatMap(sourceFiles).map((path) => ({
  file: relative(ROOT, path),
  source: readFileSync(path, "utf8"),
}));
const rows = sources.flatMap(({ file, source }) => viewportRows(file, source));
const bars = sources.flatMap(({ file, source }) => filterBars(file, source));

/** The visitors board's toolbar as it was when a tablet hid "Terjadwal". */
const OLD_BOARD_TOOLBAR = `
      toolbar={
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            className="sm:w-72 sm:flex-none lg:w-80"
          />
          <SegmentedControl<BoardFilter>
            aria-label={t("filterLabel")}
            fullWidth="phone"
            options={[]}
          />
        </div>
      }`;

describe("toolbar layout", () => {
  it("finds the screens it checks", () => {
    // A guard for the scanner itself: the board, the inbox queue, the
    // club roster, the role matrix, the loan desk and the promotion plan.
    expect(bars.length).toBeGreaterThanOrEqual(6);
    expect(bars.every(({ text }) => /<\/FilterBar>\s*$|\/>\s*$/.test(text))).toBe(true);
    // And it would have caught the board's old toolbar.
    const [old] = viewportRows("old-board.tsx", OLD_BOARD_TOOLBAR);
    expect(old?.where).toBe("old-board.tsx:3");
    expect(old && searchInViewportRow(old)).toBe(true);
    expect(old && stripInRigidViewportRow(old)).toBe(true);
    const asBar = OLD_BOARD_TOOLBAR.replace(/<div className="[^"]*">/, "<FilterBar>").replace(
      "</div>",
      "</FilterBar>",
    );
    const [bar] = filterBars("old-board.tsx", asBar);
    expect(bar && sizedByScreen(bar)).toBe(true);
  });

  it("puts no search in a row that a screen breakpoint switches on", () => {
    expect(rows.filter(searchInViewportRow).map(({ where }) => where)).toEqual([]);
  });

  it("puts no segmented filter in a screen-keyed row that cannot wrap", () => {
    expect(rows.filter(stripInRigidViewportRow).map(({ where }) => where)).toEqual([]);
  });

  it("sizes the controls in a FilterBar by the bar, never by the screen", () => {
    expect(bars.filter(sizedByScreen).map(({ where }) => where)).toEqual([]);
  });
});
