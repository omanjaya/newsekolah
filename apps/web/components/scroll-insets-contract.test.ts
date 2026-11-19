import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A Field (packages/ui) takes --scroll-inset-top and --scroll-inset-bottom as
 * its scroll margins, so focusing the first invalid one on submit keeps its
 * label clear of the sticky header and its error clear of the bottom bars.
 * Those properties exist only because the app shell's <main> carries
 * data-scroll-insets and globals.css defines them on that selector. Unit
 * tests of the Field and the submit hook stub the margins, so this guards
 * the wiring itself: drop or rename either side and the margins fall back
 * to 0 with every other test still green.
 */
const WEB_ROOT = join(__dirname, "..");
const SELECTOR = "main[data-scroll-insets]";
const PHONE_QUERY = "@media (width < 48rem)";
const INSETS = ["--scroll-inset-top", "--scroll-inset-bottom"] as const;

function read(path: string): string {
  return readFileSync(join(WEB_ROOT, path), "utf8");
}

interface Rule {
  selector: string;
  body: string;
  /** Preludes of the at-rules wrapping this rule, outermost first. */
  within: string[];
}

/** Flat list of the style rules in a stylesheet, with their enclosing at-rules. */
function styleRules(css: string): Rule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const stack: { prelude: string; start: number }[] = [];
  let preludeStart = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "{") {
      stack.push({ prelude: source.slice(preludeStart, i).trim(), start: i + 1 });
      preludeStart = i + 1;
    } else if (char === "}") {
      const open = stack.pop();
      if (open && !open.prelude.startsWith("@")) {
        rules.push({
          selector: open.prelude,
          body: source.slice(open.start, i),
          within: stack.map((frame) => frame.prelude),
        });
      }
      preludeStart = i + 1;
    } else if (char === ";" && stack.every((frame) => frame.prelude.startsWith("@"))) {
      // A statement at-rule (@import, @plugin ...) ends its own prelude.
      preludeStart = i + 1;
    }
  }
  return rules;
}

function declares(body: string, property: string): boolean {
  return new RegExp(`(^|[;\\s])${property}\\s*:`).test(body);
}

describe("scroll insets contract", () => {
  const rules = styleRules(read("app/globals.css")).filter((rule) => rule.selector === SELECTOR);

  it("defines both insets on the shell's main region for every viewport", () => {
    const desktop = rules.filter((rule) => rule.within.length === 0);
    expect(desktop).toHaveLength(1);
    for (const inset of INSETS) expect(declares(desktop[0]?.body ?? "", inset)).toBe(true);
  });

  it("reaches the phone's tab bar with the bottom inset below 48rem", () => {
    const phone = rules.filter((rule) => rule.within.includes(PHONE_QUERY));
    expect(phone).toHaveLength(1);
    const body = phone[0]?.body ?? "";
    expect(declares(body, "--scroll-inset-bottom")).toBe(true);
    expect(body).toContain("var(--shell-mobile-tab-bar)");
    // The top inset carries over from the desktop rule unless redefined here.
    const desktop = rules.find((rule) => rule.within.length === 0);
    expect(
      declares(body, "--scroll-inset-top") || declares(desktop?.body ?? "", "--scroll-inset-top"),
    ).toBe(true);
  });

  it("marks the app shell's main region with data-scroll-insets", () => {
    const shell = read("components/app-shell.tsx");
    const main = /<main\b([\s\S]*?)\n\s*>/.exec(shell)?.[1] ?? "";
    expect(main).toContain('id="main-content"');
    expect(main).toMatch(/\sdata-scroll-insets(=|\s)/);
  });

  it("names the insets the Field reads as its scroll margins", () => {
    const field = readFileSync(
      join(WEB_ROOT, "../../packages/ui/src/components/field.tsx"),
      "utf8",
    );
    for (const inset of INSETS) expect(field).toContain(`var(${inset},`);
  });
});
