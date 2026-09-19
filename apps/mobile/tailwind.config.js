/** @type {import('tailwindcss').Config} */
// Tokens mirror DESIGN.md: warm neutrals, one accent per tenant, status colors that
// stay stable across schools, radius 4/8 only (999 reserved for avatars), no gradients.
//
// Values are read from @newsekolah/ui-tokens' tokens.json, the single source
// also used to generate dist/tokens.css for apps/web, so the two apps never
// drift apart on color. This file reads tokens.json rather than the
// package's dist/tokens.ts: tailwind.config.js is loaded by a plain Node
// `require()` outside Metro's transform pipeline, and dist/tokens.ts ships
// as raw TypeScript (not compiled to .js) -- a bare `require` on it throws a
// syntax error. tokens.json is the same underlying data with none of that
// problem; worth reporting upstream so dist/tokens.ts gets a compiled
// sibling for Node-side consumers like this one.
const tokens = require("@newsekolah/ui-tokens/tokens.json");

const light = tokens.color.light;
const dark = tokens.color.dark;

/** { present: "#2F6B3A", sick: "#8A6D1F", ... } from a theme's `status` map.
 * Dark-mode status colors are not wired up yet -- nothing in this app reads
 * a dark: variant of `status-*` today -- so only the light indicator values
 * are exposed, matching the flat hex map this file replaces. */
function statusColors(theme) {
  return Object.fromEntries(
    Object.entries(theme.status).map(([name, value]) => [name, value.indicator]),
  );
}

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: light.bg, dark: dark.bg },
        surface: { DEFAULT: light.surface, dark: dark.surface },
        ink: { DEFAULT: light.fg, dark: dark.fg },
        line: { DEFAULT: light.border, dark: dark.border },
        // Accent is read from a CSS variable so tenant branding can override it at
        // runtime (see src/theme/accent.ts) without a rebuild.
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-fg": "var(--color-accent-fg)",
        status: statusColors(light),
      },
      borderRadius: {
        input: "4px",
        chip: "4px",
        card: "8px",
        dialog: "8px",
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
