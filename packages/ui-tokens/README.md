# @newsekolah/ui-tokens

Single source of truth for the design tokens of the "Hijau Segar" visual
direction (`docs/07-ui-ux.md` section 0). Everything lives in `tokens.json`;
`pnpm build` generates:

- `dist/tokens.css`: CSS custom properties on `:root`, with dark overrides under
  `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`, the phone
  step of the typography roles under `@media (width < 40rem)`, and the
  reduced-motion values under `@media (prefers-reduced-motion: reduce)`.
- `dist/type-roles.css`: one Tailwind v4 `@utility` per typography role
  (`text-display` ... `text-caption`).
- `dist/tokens.ts`: the same values as a typed object, for JavaScript callers
  and NativeWind / React Native.

`@newsekolah/config/tailwind/preset.css` imports both CSS files and maps every
token to a Tailwind theme variable or utility. `dist/` is generated, not
committed: run `pnpm --filter @newsekolah/ui-tokens build` after editing
`tokens.json` (the dev server picks the CSS up).

## What is in `tokens.json`

| Key                    | Contents                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color.light`, `.dark` | Base palette (`bg`, `surface`, `fg`, `fgMuted`, `border`, `line`, `accent*`), the role layer (`surfaceRaised`, `surfaceSunken`, `surfaceOverlay`, `scrim`, `borderStrong`, `stateHover`, `statePressed`, `stateSelected`, `focusRing`, `skeleton`, `skeletonShine`), five `category` hues and the six attendance `status` colors |
| `semantic`             | `success`/`warning`/`danger`/`info` mapped onto a category hue; the build writes them out as real values                                                                                                                                                                                                                         |
| `statusNames`          | Default Indonesian attendance status labels                                                                                                                                                                                                                                                                                      |
| `spacing`, `radius`    | 4px spacing scale; radius `xs` 4, `sm` 8, `md` 14 (controls), `lg` 20 (cards), `xl` 24 (sheets, hero), `full`                                                                                                                                                                                                                    |
| `type`, `typeRoles`    | The plain size scale (kept for compatibility) and the eight typography roles: size, line height, weight, tracking, family, and an optional `compact` step below 640px                                                                                                                                                            |
| `shadow`               | Elevation `levels` 0-3 per theme and the `aliases` `card` (1) and `float` (3)                                                                                                                                                                                                                                                    |
| `zIndex`               | Stacking layers, lowest first: `sticky`, `overlay`, `modal`, `dropdown`, `popover`, `toast`, `tooltip`                                                                                                                                                                                                                           |
| `container`            | Page widths `narrow` 720, `default` 1200, `wide` 1440                                                                                                                                                                                                                                                                            |
| `motion`               | Durations (`instant` 80, `fast` 120, `base` 200, `slow` 320), easings (`standard`, `enter`, `exit`), distances (`rise` 8, `shift` 4), scales, the stagger step and the two allowed loops                                                                                                                                         |

Translucent tokens (`scrim`, the state layers, the skeleton) are `rgba()`
strings; everything else is `#RRGGBB`. Base color values are owner-approved:
add a role token rather than changing one.

## Scripts

- `pnpm build`: regenerates `dist/` from `tokens.json` (`scripts/build-tokens.ts`,
  using the pure generators in `scripts/generate.ts`).
- `pnpm test`: the generator tests, then `scripts/contrast-check.ts`, which
  asserts WCAG AA for every text, link, control border and focus ring on every
  opaque surface, for text on each state layer composited over the surfaces it
  sits on, and for every soft badge (222 pairs). `pnpm contrast-check` runs the
  check alone. The formula is in `scripts/wcag-contrast.ts`.
