import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A grid that becomes two columns only from a breakpoint up (for example
 * `lg:grid-cols-[minmax(0,1fr)_22rem]`) also names its single column
 * below it with `grid-cols-1` (`minmax(0, 1fr)`). Without it the phone
 * layout falls back to an implicit `auto` track that grows to the widest
 * unwrapped child: one long truncated event name on the school calendar
 * made the track 881px wide in a 390px screen, and the month grid and its
 * navigation slid off-screen with no way to scroll back.
 */
const FEATURES = join(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });
}

describe("two-pane grids", () => {
  it("give the stacked layout a shrinkable column below the breakpoint", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(FEATURES)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/className="([^"]*)"/g)) {
        const classes = (match[1] ?? "").split(/\s+/);
        const isGrid = classes.includes("grid");
        const responsiveColumns = classes.some((c) => /^(sm|md|lg|xl):grid-cols-/.test(c));
        const baseColumns = classes.some((c) => c.startsWith("grid-cols-"));
        if (isGrid && responsiveColumns && !baseColumns) {
          offenders.push(`${relative(FEATURES, file)}: ${match[1] ?? ""}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
