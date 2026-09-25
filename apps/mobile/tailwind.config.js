/** @type {import('tailwindcss').Config} */
// Hijau Segar (docs/design-reference-hijau-segar.html): warm off-white
// background, white cards, one accent green, four soft chip pairs, cards
// radius 20 / controls 14 / pills full. Values come from
// src/theme/tokens.json -- the single source also read by src/theme/colors.ts
// -- rather than being duplicated here. tailwind.config.js is loaded by a
// plain Node `require()` outside Metro's transform pipeline, so it can only
// pull in plain JSON/CommonJS, not the TypeScript modules under src/theme;
// tokens.json exists precisely so both sides can share the same numbers.
//
// Attendance status colors (`status-*`) are a separate semantic system --
// tied to attendance domain meaning (present/sick/late/...), not to this
// visual direction -- and still come from @newsekolah/ui-tokens, which is
// out of scope here (another agent owns it for web at the same time).
const uiTokens = require("@newsekolah/ui-tokens/tokens.json");
const theme = require("./src/theme/tokens.json");

const light = uiTokens.color.light;

/** { present: "#2F6B3A", sick: "#8A6D1F", ... } from a theme's `status` map.
 * Dark-mode status colors are not wired up yet -- nothing in this app reads
 * a dark: variant of `status-*` today -- so only the light indicator values
 * are exposed, matching the flat hex map this file replaces. */
function statusColors(t) {
  return Object.fromEntries(
    Object.entries(t.status).map(([name, value]) => [name, value.indicator]),
  );
}

function chipColors(scheme) {
  const chips = theme.color[scheme].chips;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, pair] of Object.entries(chips)) {
    out[`chip-${name}-fg`] = pair.fg;
    out[`chip-${name}-bg`] = pair.bg;
  }
  return out;
}

const lightChips = chipColors("light");
const darkChips = chipColors("dark");

/** @type {Record<string, {DEFAULT: string, dark: string}>} */
const chipColorTokens = Object.fromEntries(
  Object.keys(lightChips).map((key) => [key, { DEFAULT: lightChips[key], dark: darkChips[key] }]),
);

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: theme.color.light.bg, dark: theme.color.dark.bg },
        // "surface" is the card/panel background; kept under its original
        // key (rather than renamed to "card") so every existing
        // bg-surface/border-line usage across the app keeps working.
        surface: { DEFAULT: theme.color.light.card, dark: theme.color.dark.card },
        ink: { DEFAULT: theme.color.light.text, dark: theme.color.dark.text },
        muted: { DEFAULT: theme.color.light.muted, dark: theme.color.dark.muted },
        // Generic divider/border (ScreenHeader's bottom rule, the tab bar's
        // top rule, input borders).
        line: { DEFAULT: theme.color.light.line, dark: theme.color.dark.line },
        // The 1px ring around a card/tile specifically -- a hair lighter
        // than `line` in light mode per the reference mockup.
        hairline: { DEFAULT: theme.color.light.cardBorder, dark: theme.color.dark.cardBorder },
        // Accent stays a CSS variable so tenant branding can override it at
        // runtime (see src/theme/accent.ts) without a rebuild; its default
        // is now Hijau Segar's #0F7A5F.
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-fg": "var(--color-accent-fg)",
        "accent-text": { DEFAULT: theme.color.light.accentText, dark: theme.color.dark.accentText },
        "accent-soft": { DEFAULT: theme.color.light.accentSoft, dark: theme.color.dark.accentSoft },
        status: statusColors(light),
        ...chipColorTokens,
      },
      borderRadius: {
        input: `${theme.radius.control}px`,
        chip: `${theme.radius.pill}px`,
        card: `${theme.radius.card}px`,
        dialog: `${theme.radius.card}px`,
      },
      fontFamily: {
        heading: ["Manrope_700Bold"],
        "heading-extrabold": ["Manrope_800ExtraBold"],
        "heading-semibold": ["Manrope_600SemiBold"],
        body: ["PlusJakartaSans_400Regular"],
        "body-medium": ["PlusJakartaSans_500Medium"],
        "body-semibold": ["PlusJakartaSans_600SemiBold"],
        "body-bold": ["PlusJakartaSans_700Bold"],
      },
      fontSize: {
        xs: "12px",
        sm: "13px",
        base: "14px",
        md: "16px",
        lg: "20px",
        xl: "24px",
        "2xl": "32px",
      },
    },
  },
  plugins: [],
};
