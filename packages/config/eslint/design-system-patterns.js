// Class-name patterns the design system forbids, as no-restricted-syntax
// entries on string literals and template text, the same technique as the
// emoji restriction (./emoji-pattern.js). Each source is fed to esquery as
// a regex literal, so it must not contain a forward slash.
//
// Two groups:
// - zero-violation rules (palette and arbitrary colors), on for the whole
//   repo through ./base.js and ./react.js;
// - ratchet rules (literal font sizes), switched on per package once that
//   package is clean. packages/ui is; apps/web follows in a later wave.

const COLOR_UTILITIES =
  "(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)";
const PALETTE_HUES =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";

/** `text-red-500`, `bg-gray-100`, `border-t-slate-200/50`, ... (Tailwind's built-in palette). */
export const PALETTE_COLOR_SOURCE = String.raw`\b${COLOR_UTILITIES}(?:-[a-z]+)?-${PALETTE_HUES}-(?:50|[1-9]00|950)\b`;

/** `bg-white`, `text-black`, ...: fixed colors that ignore the theme. */
export const FIXED_COLOR_SOURCE = String.raw`\b${COLOR_UTILITIES}(?:-[a-z]+)?-(?:white|black)\b`;

/** `bg-[#fff]`, `text-[rgb(0,0,0)]`, `shadow-[0_1px_2px_#0002]`: a literal color inside an arbitrary value. */
export const ARBITRARY_COLOR_SOURCE = String.raw`-\[[^\]]*(?:#[0-9a-fA-F]{3,8}\b|(?<![a-z])(?:rgba?|hsla?|oklch|oklab|lch|lab|hwb)\()`;

/** `text-[13px]`, `text-[1.5rem]`: a literal font size instead of a typography role. */
export const ARBITRARY_FONT_SIZE_SOURCE = String.raw`\btext-\[\d+(?:\.\d+)?(?:px|rem|em)?\]`;

/**
 * @param {string} source regex source, no forward slashes
 * @param {string} message
 * @returns {{ selector: string, message: string }[]}
 */
function literalRestrictions(source, message) {
  return [
    { selector: `Literal[value=/${source}/]`, message },
    { selector: `TemplateElement[value.raw=/${source}/]`, message },
  ];
}

const COLOR_MESSAGE =
  "Use a design token color (bg-surface, text-fg-muted, border-border-strong, text-danger, ...), not a Tailwind palette or fixed color. See docs/07-ui-ux.md section 0.";

/** On for the whole repo: there are no violations to migrate. */
export const colorRestrictions = [
  ...literalRestrictions(PALETTE_COLOR_SOURCE, COLOR_MESSAGE),
  ...literalRestrictions(FIXED_COLOR_SOURCE, COLOR_MESSAGE),
  ...literalRestrictions(
    ARBITRARY_COLOR_SOURCE,
    "A literal color in an arbitrary value skips the token palette and its contrast check. Use a token color class or a token variable.",
  ),
];

/** On per package, once clean (packages/ui today). */
export const fontSizeRestrictions = literalRestrictions(
  ARBITRARY_FONT_SIZE_SOURCE,
  "Use a typography role (text-display, text-title-lg, text-title, text-heading, text-body, text-body-sm, text-label, text-caption) instead of a literal font size.",
);
