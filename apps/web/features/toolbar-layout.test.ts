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
 *
 * The same holds for the shared components in packages/ui, which sit in
 * any column (the DataTable's toolbar put a 288px search in a class's
 * 216px roster card at 768px), for a grid that turns into a row at a
 * breakpoint (grading's three scope pickers ran to x=808 on a 768px
 * screen), and for a fixed-width list beside a detail, which must not
 * split the column at md, where the sidebar leaves it 480px.
 */
const ROOT = join(__dirname, "..");
const UI = join(ROOT, "..", "..", "packages", "ui", "src", "components");
const SCANNED = [join(ROOT, "features"), join(ROOT, "components"), UI];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });
}

const BREAKPOINT = String.raw`(?:max-)?(?:sm|md|lg|xl|2xl)`;
/** A switch to a row at a screen breakpoint: `sm:flex-row`, `md:flex-row`. */
const VIEWPORT_FLEX_ROW = new RegExp(String.raw`(?:^|[\s"'\x60])${BREAKPOINT}:flex-row\b`);
/** A switch to flex display at a screen breakpoint: `sm:flex`, `md:flex`. */
const VIEWPORT_FLEX = new RegExp(String.raw`(?:^|[\s"'\x60])${BREAKPOINT}:flex(?![-\w])`);
/** A grid at any width: with `sm:flex` it turns into a row there. */
const GRID = /(?:^|[\s"'`])grid(?![-\w])/;
/** A flex box at any width, a row unless it is a column. */
const FLEX = /(?:^|[\s"'`])flex(?![-\w])/;
const COLUMN = /(?:^|[\s"'`])flex-col\b/;
/** Wrapping at any width: a row that wraps moves a control on, never clips it. */
const WRAPS = /(?:^|[\s"'`:])flex-wrap\b/;
/** A control's own row width or placement keyed to a screen breakpoint. */
const VIEWPORT_SIZING = new RegExp(
  String.raw`(?:^|[\s"'\x60])${BREAKPOINT}:(?:w-|min-w-|max-w-|flex-|basis-|grow|shrink|ml-auto|mr-auto|self-)`,
);
/**
 * Room a search claims at a screen breakpoint whatever its column has
 * (`md:w-72 md:flex-none`), unlike a cap (`sm:max-w-64`) that only limits it.
 */
const VIEWPORT_ROOM = new RegExp(
  String.raw`(?:^|[\s"'\x60])${BREAKPOINT}:(?:w-|min-w-|basis-|flex-none|flex-initial|shrink-0)`,
);
/** A width that is not the container's: `w-40`, `sm:w-48`, `w-[13rem]`. */
const FIXED_WIDTH = /(?:^|[\s"'`])(?:(?:sm|md|lg|xl|2xl):)?w-(?:\d|\[)/;
/** A list column of a set width beside the rest, from md: `md:grid-cols-[240px_1fr]`. */
const PANE_AT_MD = /(?:^|[\s"'`])md:grid-cols-\[(?:minmax\(0,\s*)?\d+(?:\.\d+)?(?:px|rem)(?![a-z])/;

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

/** Each element, once, whose own tag `matches`, found from lines that `hint` at it. */
function elements(
  file: string,
  source: string,
  hint: RegExp,
  matches: (tag: string) => boolean,
): Found[] {
  const lines = source.split("\n");
  const seen = new Set<number>();
  return lines.flatMap((line, index) => {
    if (!hint.test(line)) return [];
    const element = elementAround(lines, index);
    if (seen.has(element.start) || !matches(element.tag)) return [];
    seen.add(element.start);
    return [{ where: `${file}:${String(element.start + 1)}`, ...element }];
  });
}

/**
 * Each element whose own classes turn it into a row at a screen
 * breakpoint: `flex-col sm:flex-row`, or a grid that becomes `sm:flex`.
 */
function viewportRows(file: string, source: string): Found[] {
  return elements(
    file,
    source,
    new RegExp(`${VIEWPORT_FLEX_ROW.source}|${VIEWPORT_FLEX.source}`),
    (tag) => VIEWPORT_FLEX_ROW.test(tag) || (GRID.test(tag) && VIEWPORT_FLEX.test(tag)),
  );
}

/** Each element that is a row at some width and never wraps (a `<div>`'s own classes). */
function rigidRows(file: string, source: string): Found[] {
  return elements(
    file,
    source,
    /^\s*<div\b/,
    (tag) =>
      !WRAPS.test(tag) &&
      ((FLEX.test(tag) && !COLUMN.test(tag)) ||
        VIEWPORT_FLEX_ROW.test(tag) ||
        VIEWPORT_FLEX.test(tag)),
  );
}

/** Each `<FilterBar>` element in a source. */
function filterBars(file: string, source: string): Found[] {
  return elements(file, source, /^\s*<FilterBar\b/, () => true);
}

/** Each `<SearchInput>` element in a source. */
function searchInputs(file: string, source: string): Found[] {
  return elements(file, source, /^\s*<SearchInput\b/, () => true);
}

/** The opening tags of the `<Select>` elements inside an element. */
function selectTags(element: Found): string[] {
  const lines = element.text.split("\n");
  return lines.flatMap((line, index) =>
    /^\s*<Select\b/.test(line) ? [elementAround(lines, index).tag] : [],
  );
}

/** Each line that splits the column into a set-width list and the rest from md. */
function panesAtMd(file: string, source: string): string[] {
  return source
    .split("\n")
    .flatMap((line, index) => (PANE_AT_MD.test(line) ? [`${file}:${String(index + 1)}`] : []));
}

const searchInViewportRow = (row: Found): boolean => row.text.includes("<SearchInput");
const stripInRigidViewportRow = (row: Found): boolean =>
  row.text.includes("<SegmentedControl") && !WRAPS.test(row.tag);
const sizedByScreen = (bar: Found): boolean =>
  VIEWPORT_SIZING.test(bar.text) || bar.text.includes('fullWidth="phone"');
/** Two fixed-width pickers side by side always need their sum, whatever the column has left. */
const fixedSelectsInRigidRow = (row: Found): boolean =>
  selectTags(row).filter((tag) => FIXED_WIDTH.test(tag)).length >= 2;
const searchSizedByScreen = (search: Found): boolean => VIEWPORT_ROOM.test(search.tag);

const sources = SCANNED.flatMap(sourceFiles).map((path) => ({
  file: relative(join(ROOT, "..", ".."), path),
  source: readFileSync(path, "utf8"),
}));
const rows = sources.flatMap(({ file, source }) => viewportRows(file, source));
const rigid = sources.flatMap(({ file, source }) => rigidRows(file, source));
const bars = sources.flatMap(({ file, source }) => filterBars(file, source));
const searches = sources.flatMap(({ file, source }) => searchInputs(file, source));
const panes = sources.flatMap(({ file, source }) => panesAtMd(file, source));

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

/** Grading's scope pickers as they were when they ran past a 768px screen. */
const OLD_GRADING_SCOPE = `
  const scope = (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
      <Select
        options={classList}
        onValueChange={(value) => {
          setClassId(value);
        }}
        className="w-full sm:w-40"
      />
      <div className="col-span-2 max-sm:order-last sm:col-span-1">
        <Select
          options={subjectList}
          className="w-full sm:w-48"
        />
      </div>
      <div className="min-w-0">{termSelect}</div>
    </div>
  );`;

/** The DataTable toolbar's search as it was when it ran past a class's roster card. */
const OLD_TABLE_SEARCH = `
      {showSearch && (
        <SearchInput
          ref={searchRef}
          size="sm"
          className="order-1 min-w-0 flex-1 basis-0 md:w-72 md:flex-none md:basis-auto lg:w-80"
        />
      )}`;

/** The class list beside the class as it was when it left the class 216px at 768px. */
const OLD_CLASSES_PANES = `
        <div className="grid grid-cols-1 min-w-0 gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,248px)_minmax(0,1fr)]">`;

describe("toolbar layout", () => {
  it("finds the screens it checks", () => {
    // A guard for the scanner itself: the board, the inbox queue, the
    // club roster, the role matrix, the loan desk and the promotion plan.
    expect(bars.length).toBeGreaterThanOrEqual(6);
    expect(bars.every(({ text }) => /<\/FilterBar>\s*$|\/>\s*$/.test(text))).toBe(true);
    // The shared components are scanned too, the DataTable's toolbar among them.
    expect(searches.some(({ where }) => where.includes("data-table/data-table-toolbar.tsx"))).toBe(
      true,
    );
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

  it("would have caught grading's scope row, the table's search and the class panes", () => {
    const [grading] = viewportRows("old-grading.tsx", OLD_GRADING_SCOPE);
    expect(grading?.where).toBe("old-grading.tsx:3");
    const [rigidGrading] = rigidRows("old-grading.tsx", OLD_GRADING_SCOPE);
    expect(rigidGrading?.where).toBe("old-grading.tsx:3");
    expect(rigidGrading && fixedSelectsInRigidRow(rigidGrading)).toBe(true);
    // Wrapping, the same pickers move on whole instead of running past the column.
    const wrapped = OLD_GRADING_SCOPE.replace("sm:w-auto", "sm:w-auto sm:flex-wrap");
    expect(rigidRows("old-grading.tsx", wrapped).filter(fixedSelectsInRigidRow)).toEqual([]);

    const [search] = searchInputs("old-toolbar.tsx", OLD_TABLE_SEARCH);
    expect(search && searchSizedByScreen(search)).toBe(true);

    expect(panesAtMd("old-classes.tsx", OLD_CLASSES_PANES)).toEqual(["old-classes.tsx:2"]);
    expect(
      panesAtMd("old-roles.tsx", 'className="grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"'),
    ).toHaveLength(1);
    expect(panesAtMd("old-duties.tsx", 'className="grid md:grid-cols-[240px_1fr]"')).toHaveLength(
      1,
    );
    // Equal columns of a form are not a list beside a detail.
    expect(panesAtMd("form.tsx", 'className="grid md:grid-cols-2"')).toEqual([]);
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

  it("sizes no search box by the screen, in the shared components or a screen", () => {
    expect(searches.filter(searchSizedByScreen).map(({ where }) => where)).toEqual([]);
  });

  it("puts no two fixed-width pickers in a row that cannot wrap", () => {
    expect(rigid.filter(fixedSelectsInRigidRow).map(({ where }) => where)).toEqual([]);
  });

  it("splits no set-width list beside a detail at md, where the sidebar leaves 480px", () => {
    expect(panes).toEqual([]);
  });
});
