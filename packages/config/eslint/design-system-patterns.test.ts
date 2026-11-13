/* eslint-disable no-restricted-syntax -- the fixtures are the very class names under test */
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import { baseNoRestrictedSyntax } from "./base.js";
import { fontSizeRestrictions } from "./design-system-patterns.js";
import { reactNoRestrictedSyntax } from "./react.js";

interface Entry {
  selector: string;
  message: string;
}

function messages(code: string, restrictions: Entry[]): string[] {
  const linter = new Linter({ configType: "flat" });
  return linter
    .verify(
      code,
      [
        {
          files: ["**/*.tsx"],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          rules: { "no-restricted-syntax": ["error", ...restrictions] },
        },
      ],
      "fixture.tsx",
    )
    .map((message) => message.message);
}

const flagged = (code: string, restrictions: Entry[] = reactNoRestrictedSyntax) =>
  messages(code, restrictions).length > 0;

describe("design-system lint patterns", () => {
  it.each([
    'const a = <div className="bg-gray-100 p-4" />;',
    'const a = "text-red-500";',
    "const a = `hover:border-t-slate-200 ${b}`;",
    'const a = <p className="ring-emerald-600/40" />;',
    'const a = <p className="bg-white text-black" />;',
    'const a = "shadow-black/40";',
  ])("rejects a palette or fixed color class: %s", (code) => {
    expect(flagged(code)).toBe(true);
  });

  it.each([
    'const a = "bg-[#fff]";',
    'const a = "text-[rgb(10,20,30)]";',
    'const a = "shadow-[0_24px_70px_-32px_rgba(0,0,0,0.35)]";',
    'const a = "border-[oklch(0.7_0.1_160)]";',
    'const a = "bg-[white]";',
    'const a = "shadow-[0_0_0_1px_black]";',
    'const a = "bg-[color-mix(in_oklab,white,black)]";',
  ])("rejects a literal color inside an arbitrary value: %s", (code) => {
    expect(flagged(code)).toBe(true);
  });

  it.each([
    'const a = <div className="bg-surface text-fg-muted border-border-strong" />;',
    'const a = "bg-category-green-soft text-category-red-soft-fg text-danger";',
    'const a = "bg-accent-soft hover:bg-state-hover shadow-2";',
    'const a = "shadow-[0_1px_0_0_var(--color-line)] max-w-[calc(100vw-2rem)]";',
    'const a = "text-[13px]";',
    'const a = "bg-[var(--color-black-soft)] [&_.blackboard]:p-2";',
    'const a = "bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]";',
  ])("allows token classes and color-free arbitrary values: %s", (code) => {
    expect(flagged(code)).toBe(false);
  });

  it("keeps the emoji rule when the lists are combined", () => {
    const check = String.fromCodePoint(0x2705);
    expect(flagged(`const a = "Selesai ${check}";`, baseNoRestrictedSyntax)).toBe(true);
  });

  describe("font size ratchet", () => {
    const withFontSizes = [...reactNoRestrictedSyntax, ...fontSizeRestrictions];

    it.each([
      'const a = <p className="text-[13px] text-fg" />;',
      'const a = "md:text-[26px]";',
      "const a = `text-[1.5rem] ${b}`;",
      'const a = "text-[.8rem]";',
      'const a = "text-[80%]";',
      'const a = "text-[length:13px]";',
      'const a = "text-[clamp(1rem,2vw,2rem)]";',
      'const a = "text-[calc(1rem+2px)]";',
      'const a = "text-[13px]/5";',
    ])("rejects a literal font size where it is on: %s", (code) => {
      expect(flagged(code, withFontSizes)).toBe(true);
    });

    it.each([
      'const a = <p className="text-caption text-fg-muted" />;',
      'const a = "text-[length:var(--x)] text-[var(--color-fg)]";',
    ])("allows roles and non-size arbitrary text values: %s", (code) => {
      expect(flagged(code, withFontSizes)).toBe(false);
    });
  });
});
