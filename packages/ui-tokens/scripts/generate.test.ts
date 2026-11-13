import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCss, buildTs, buildTypeRolesCss, packageRoot } from "./generate.js";

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block`);
  return css.slice(start, css.indexOf("\n}", start));
}

function zIndex(css: string, name: string): number {
  const match = new RegExp(`--z-${name}: (\\d+);`).exec(css);
  if (!match?.[1]) throw new Error(`no --z-${name}`);
  return Number(match[1]);
}

describe("generated tokens", () => {
  const css = buildCss();

  it("covers every color key of tokens.json in both themes", () => {
    const source = JSON.parse(readFileSync(resolve(packageRoot, "tokens.json"), "utf-8")) as {
      color: Record<"light" | "dark", Record<string, unknown>>;
    };
    const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    for (const theme of ["light", "dark"] as const) {
      const scope = theme === "light" ? block(css, ":root") : block(css, '[data-theme="dark"]');
      for (const [key, value] of Object.entries(source.color[theme])) {
        if (typeof value !== "string") continue;
        expect(scope).toContain(`--color-${kebab(key)}: ${value};`);
      }
    }
  });

  it("exports the new scales from the typed module", () => {
    const ts = buildTs();
    for (const name of ["typeRoles", "elevation", "shadow", "zIndex", "container", "motion"]) {
      expect(ts).toContain(`export const ${name} =`);
    }
    expect(ts).toContain(
      'card: "0 1px 2px rgba(27, 29, 26, 0.04), 0 1px 0 rgba(27, 29, 26, 0.02)"',
    );
  });

  it("gives the dark theme its own elevation and raised surfaces", () => {
    const dark = block(css, '[data-theme="dark"]');
    expect(dark).toContain("--shadow-3: 0 16px 40px rgba(0, 0, 0, 0.56)");
    expect(dark).toContain("--color-surface-overlay: #282621;");
    expect(block(css, ':root:not([data-theme="light"])')).toContain("--shadow-1:");
  });

  it("keeps card and float as aliases onto elevation levels in every theme block", () => {
    for (const selector of [":root", '[data-theme="dark"]', ':root:not([data-theme="light"])']) {
      const scope = block(css, selector);
      expect(scope).toContain("--shadow-card: var(--shadow-1);");
      expect(scope).toContain("--shadow-float: var(--shadow-3);");
    }
  });

  it("orders dark surfaces by what stacks on what", () => {
    const source = JSON.parse(readFileSync(resolve(packageRoot, "tokens.json"), "utf-8")) as {
      color: { dark: Record<string, string> };
    };
    const { dark } = source.color;
    // Lightness of an opaque #RRGGBB, enough to compare neighbouring greys.
    const level = (hex: string | undefined) => parseInt((hex ?? "#000000").slice(1, 3), 16);
    expect(level(dark.surfaceSunken)).toBeLessThan(level(dark.bg));
    expect(level(dark.bg)).toBeLessThan(level(dark.surface));
    expect(level(dark.surface)).toBeLessThan(level(dark.surfaceOverlay));
    expect(level(dark.surfaceOverlay)).toBeLessThan(level(dark.surfaceRaised));
  });

  it("writes semantic colors as real values, not aliases", () => {
    expect(css).toContain("--color-danger: #B3261E;");
    expect(css).toContain("--color-success-soft-fg: #0B3B2E;");
    expect(css).not.toMatch(/--color-(success|warning|danger|info)[a-z-]*: var\(/);
  });

  it("stacks menus and popovers above modals, and modals above sticky bars", () => {
    expect(zIndex(css, "dropdown")).toBeGreaterThan(zIndex(css, "modal"));
    expect(zIndex(css, "popover")).toBeGreaterThan(zIndex(css, "modal"));
    expect(zIndex(css, "modal")).toBeGreaterThan(zIndex(css, "overlay"));
    expect(zIndex(css, "overlay")).toBeGreaterThan(zIndex(css, "sticky"));
    expect(zIndex(css, "tooltip")).toBeGreaterThan(zIndex(css, "toast"));
  });

  it("steps the display role down on a phone", () => {
    expect(block(css, "@media (width < 40rem)")).toContain("--type-display-size: 24px;");
  });

  it("drops movement but keeps short fades under reduced motion", () => {
    const reduced = block(css, "@media (prefers-reduced-motion: reduce)");
    expect(reduced).toContain("--motion-rise: 0px;");
    expect(reduced).toContain("--motion-scale-dialog: 1;");
    expect(reduced).toContain("--duration-slow: 120ms;");
    expect(reduced).not.toContain("--duration-fast:");
  });

  it("emits one Tailwind utility per typography role", () => {
    const roles = buildTypeRolesCss();
    for (const name of ["display", "title-lg", "title", "heading", "body", "body-sm", "label"]) {
      expect(roles).toContain(`@utility text-${name} {`);
    }
    expect(block(roles, "@utility text-caption")).toContain("font-family: var(--font-sans);");
    expect(block(roles, "@utility text-display")).toContain("font-family: var(--font-heading);");
  });

  it("balances display and title but not a heading", () => {
    const roles = buildTypeRolesCss();
    expect(block(roles, "@utility text-display")).toContain("text-wrap-style: balance;");
    expect(block(roles, "@utility text-title")).toContain("text-wrap-style: balance;");
    expect(block(roles, "@utility text-heading")).not.toContain("text-wrap-style");
  });

  it("gives long travel its own easing curve", () => {
    expect(block(css, ":root")).toContain("--ease-sheet: cubic-bezier(0.32, 0.72, 0, 1);");
  });
});
