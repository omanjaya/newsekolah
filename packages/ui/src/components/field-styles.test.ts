import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { cn } from "../utils/cn.js";

import { FIELD_BORDER_CLASSES, FIELD_SHELL_BORDER_CLASSES } from "./field-styles.js";

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

describe("field shell border states", () => {
  /** Puts the compiled shell rules in the document and returns the shell's resolved border variable. */
  async function shellBorder(input: { invalid: boolean; focused: boolean }): Promise<string> {
    const compiler = await compile(
      "@theme { --color-danger: #b3261e; --color-accent: #0f7a5f; } @tailwind utilities;",
    );
    const style = document.createElement("style");
    style.textContent = compiler.build(FIELD_SHELL_BORDER_CLASSES.split(" "));
    document.head.append(style);
    const shell = document.createElement("div");
    shell.className = FIELD_SHELL_BORDER_CLASSES;
    const field = document.createElement("input");
    if (input.invalid) field.setAttribute("aria-invalid", "true");
    shell.append(field);
    document.body.append(shell);
    if (input.focused) field.focus();
    const value = getComputedStyle(shell).getPropertyValue("--field-border").trim();
    shell.remove();
    style.remove();
    return value;
  }

  it("takes the accent on focus", async () => {
    expect(await shellBorder({ invalid: false, focused: true })).toBe("var(--color-accent)");
  });

  // The focus rule's :has(:is(input:focus-visible, ...)) outranks the plain
  // invalid rule, so without its own rule a focused invalid box went green.
  it("keeps the danger border on a focused invalid box", async () => {
    expect(await shellBorder({ invalid: true, focused: false })).toBe("var(--color-danger)");
    expect(await shellBorder({ invalid: true, focused: true })).toBe("var(--color-danger)");
  });
});
