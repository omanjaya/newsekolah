import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every DataTable with a search box says what it searches ("Cari nama atau
 * nama pengguna"), not the bare default "Cari": sibling lists disagreed,
 * and the reader could not tell whether a username or a NIS would match.
 * A table whose search a reader cannot use (codes, ids, dates) turns it
 * off with `searchable={false}` instead, and its "nothing matches" state
 * then says so too: a FilteredEmptyState there passes `searchable={false}`
 * (or its own description), so it never suggests "another keyword" the
 * reader has no box to type into.
 */
const FEATURES = join(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });
}

/** Each `<DataTable ... />` opening tag, up to the line closing it at its own indent. */
function dataTableTags(source: string): string[] {
  const lines = source.split("\n");
  const tags: string[] = [];
  lines.forEach((line, index) => {
    const open = /^(\s*)<DataTable$/.exec(line);
    if (!open) return;
    const indent = open[1] ?? "";
    const end = lines.findIndex((next, at) => at > index && new RegExp(`^${indent}/?>`).test(next));
    tags.push(lines.slice(index, end + 1).join("\n"));
  });
  return tags;
}

/** Each `<FilteredEmptyState ... />` element in a source, up to its end. */
function filteredEmptyStates(source: string): string[] {
  return [...source.matchAll(/<FilteredEmptyState\b[\s\S]*?\/>/g)].map(([match]) => match);
}

/** Whether a FilteredEmptyState's hint can only speak of filters. */
function hintFitsNoSearch(element: string): boolean {
  return element.includes("searchable={false}") || /\sdescription=/.test(element);
}

function hasSearch(tag: string): boolean {
  if (tag.includes("searchable={false}")) return false;
  return /mode="local"|onGlobalFilterChange|searchable[\s=>]/.test(tag);
}

describe("DataTable search boxes", () => {
  const tables = sourceFiles(FEATURES).flatMap((path) =>
    dataTableTags(readFileSync(path, "utf8")).map((tag) => ({ path, tag })),
  );

  it("finds the tables it checks", () => {
    // A guard for the scanner itself: the app has dozens of tables.
    expect(tables.length).toBeGreaterThan(40);
    expect(tables.every(({ tag }) => /\/?>$/.test(tag))).toBe(true);
  });

  it("name what they search in every feature", () => {
    const offenders = tables
      .filter(({ tag }) => hasSearch(tag) && !tag.includes("searchPlaceholder"))
      .map(({ path }) => relative(FEATURES, path));
    expect(offenders).toEqual([]);
  });

  it("do not suggest another keyword when the table has no search box", () => {
    const offenders = sourceFiles(FEATURES).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const tags = dataTableTags(source);
      // A screen whose every table lacks a search box: each of its
      // "nothing matches" states, wherever it is built. Otherwise only
      // the ones written inside a search-less table's own tag.
      const candidates =
        tags.length > 0 && tags.every((tag) => !hasSearch(tag))
          ? filteredEmptyStates(source)
          : tags.filter((tag) => !hasSearch(tag)).flatMap(filteredEmptyStates);
      return candidates
        .filter((element) => !hintFitsNoSearch(element))
        .map(() => relative(FEATURES, path));
    });
    expect(offenders).toEqual([]);
  });
});
