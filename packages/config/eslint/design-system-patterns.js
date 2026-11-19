// Class-name patterns the design system forbids, as no-restricted-syntax
// entries on string literals and template text, the same technique as the
// emoji restriction (./emoji-pattern.js). Each source is fed to esquery as
// a regex literal, so it must not contain a forward slash.
//
// Two groups:
// - zero-violation rules (palette and arbitrary colors), on for the whole
//   repo through ./base.js and ./react.js;
// - rules switched on per package: literal font sizes here for packages/ui,
//   and the same pattern, the panel radius and the element rules as
//   separate rules in ./design-system-plugin.js, which apps/web uses.

const COLOR_UTILITIES =
  "(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)";
const PALETTE_HUES =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";

/** `text-red-500`, `bg-gray-100`, `border-t-slate-200/50`, ... (Tailwind's built-in palette). */
export const PALETTE_COLOR_SOURCE = String.raw`\b${COLOR_UTILITIES}(?:-[a-z]+)?-${PALETTE_HUES}-(?:50|[1-9]00|950)\b`;

/** `bg-white`, `text-black`, ...: fixed colors that ignore the theme. */
export const FIXED_COLOR_SOURCE = String.raw`\b${COLOR_UTILITIES}(?:-[a-z]+)?-(?:white|black)\b`;

/**
 * `bg-[#fff]`, `text-[rgb(0,0,0)]`, `shadow-[0_1px_2px_#0002]`, `bg-[white]`,
 * `shadow-[0_0_0_1px_black]`, `bg-[color-mix(in_oklab,white,black)]`: a
 * literal color inside an arbitrary value. `white`/`black` only count as
 * whole words, so `var(--color-black-soft)` or a class like `blackboard`
 * stays allowed.
 */
export const ARBITRARY_COLOR_SOURCE = String.raw`-\[[^\]]*(?:#[0-9a-fA-F]{3,8}\b|(?<![a-z])(?:rgba?|hsla?|oklch|oklab|lch|lab|hwb)\(|(?<![a-z-])(?:white|black)(?![a-z-]))`;

/**
 * `text-[13px]`, `text-[1.5rem]`, `text-[.8rem]`, `text-[80%]`,
 * `text-[length:13px]`, `text-[clamp(...)]`, `text-[calc(...)]`: a literal
 * font size instead of a typography role. `text-[length:var(--x)]` and
 * `text-[var(--color-fg)]` stay allowed.
 */
export const ARBITRARY_FONT_SIZE_SOURCE = String.raw`\btext-\[(?:length:)?(?:\d*\.?\d+(?:px|rem|em|%|pt)?\]|(?:clamp|calc|min|max)\()`;

/**
 * A class string that draws a 1px border (`border`, any variant prefix)
 * and the retired small surface radius (`rounded-sm`, `rounded-xs`): the
 * hand-made panel the overhaul replaced with `Card` (radius lg), `Alert`
 * and `List`. Small controls inside packages/ui keep their radius; this
 * pattern is for screens.
 */
export const PANEL_RADIUS_SOURCE = String.raw`^(?=[\s\S]*(?:^|[\s:])border(?:\s|$))(?=[\s\S]*(?:^|[\s:])rounded-(?:xs|sm)(?:\s|$))`;

/**
 * `outline-none`, `outline-hidden`, `outline-0`, `focus:outline-none`,
 * `md:outline-none`, `focus-visible:outline-none`: a class that switches
 * off the base `:focus-visible` ring (packages/ui/src/styles.css) under any
 * variant chain. Tailwind's utilities layer beats that base rule, so the
 * control is left with no visible focus at all (WCAG 2.4.7).
 */
export const HIDDEN_FOCUS_OUTLINE_SOURCE = String.raw`(?:^|\s)!?(?:[\w-]+(?:-\[[^\]]*\])?:)*!?outline-(?:none|hidden|0)!?(?=\s|$)`;

/**
 * `focus-visible:outline-2`, `focus-visible:outline-focus-ring`,
 * `md:focus-visible:outline-2`, `has-[input:focus-visible]:outline-2`: the
 * element's own focus-visible (or has-[...]) variant draws a ring, so a
 * hidden outline next to it is deliberate. It must start the class (after
 * any plain variants), so `group-focus-visible:outline-2` or
 * `peer-focus-visible:outline-2`, which style a different element, do not
 * count. Neither do an offset alone (`focus-visible:-outline-offset-2`) nor
 * a second hidden outline (`focus-visible:outline-none`), which draw nothing.
 */
export const FOCUS_OUTLINE_STYLE_SOURCE = String.raw`(?:^|\s)(?:[\w-]+:)*(?:focus-visible|has-\[[^\]]*\]):!?outline-(?!offset|none|hidden|0(?=!|\s|$))`;

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
  "Use a typography role (text-display, text-title-lg, text-title, text-heading, text-body-lg, text-body, text-body-sm, text-label, text-caption; on wall screens text-kiosk-display, text-kiosk-title) instead of a literal font size.",
);
