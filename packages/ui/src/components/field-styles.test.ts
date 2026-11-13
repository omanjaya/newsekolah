import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { cn } from "../utils/cn.js";

import { FIELD_BORDER_CLASSES } from "./field-styles.js";

/** Compiles the field classes with Tailwind itself, so the test sees the real rule order. */
async function compiledFieldCss(): Promise<string> {
  const compiler = await compile(
    "@theme { --color-danger: #b3261e; --color-accent: #0f7a5f; } @tailwind utilities;",
  );
  return compiler.build(FIELD_BORDER_CLASSES.split(" "));
}

describe("field border states", () => {
  it("lets the invalid border win over hover and focus", async () => {
    const css = await compiledFieldCss();
    const hover = css.indexOf("--field-border: var(--color-fg-muted)");
    const focus = css.indexOf("--field-border: var(--color-accent)");
    const invalid = css.indexOf("--field-border: var(--color-danger)");
    // All three rules have the same specificity (one class, one state), so
    // the one that comes last wins whenever two apply at once.
    expect(hover).toBeGreaterThan(-1);
    expect(focus).toBeGreaterThan(hover);
    expect(invalid).toBeGreaterThan(focus);
  });

  it("reads the border color from the variable the states set", async () => {
    const css = await compiledFieldCss();
    expect(css).toContain("border-color: var(--field-border)");
  });

  it("gives way to a caller's own border color in every state", () => {
    const merged = cn(FIELD_BORDER_CLASSES, "border-accent").split(" ");
    expect(merged).toContain("border-accent");
    expect(merged).not.toContain("border-(--field-border)");
  });
});
