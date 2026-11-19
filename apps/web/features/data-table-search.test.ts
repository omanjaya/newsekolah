import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every DataTable with a search box says what it searches ("Cari nama atau
 * nama pengguna"), not the bare default "Cari": sibling lists disagreed,
 * and the reader could not tell whether a username or a NIS would match.
 * A table whose search a reader cannot use (codes, ids, dates) turns it
 * off with `searchable={false}` instead.
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
});
