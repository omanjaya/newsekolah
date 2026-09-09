# @newsekolah/ui-tokens

Single source of truth for design tokens (`tokens.json`), generated into:

- `dist/tokens.css`: CSS custom properties on `:root`, with dark overrides under
  `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`. Consumed by
  `@newsekolah/config/tailwind/preset.css`.
- `dist/tokens.ts`: the same values as a typed object, for NativeWind / React
  Native (`packages/mobile-ui`).

Colors follow `DESIGN.md`: warm neutral surfaces, one tenant accent
(`--color-accent`, overridable at runtime from branding), and six fixed
status colors (present, sick, excused, dispensation, absent, late). Status
`indicator` values are the DESIGN.md hex used for icons/dots/borders (checked
at 3:1 against the surface); `fg` values are text-safe variants (checked at
4.5:1) used when a status renders as colored text.

## Scripts

- `pnpm build`: regenerates `dist/tokens.css` and `dist/tokens.ts` from `tokens.json`.
- `pnpm contrast-check` (also run by `pnpm test`): asserts every text/background
  pair meets WCAG AA 4.5:1 and every status color meets 3:1 against its
  surface, using the WCAG 2.x formula in `scripts/wcag-contrast.ts`.

Edit `tokens.json`, then run `pnpm build` before committing so `dist/` stays
in sync.
