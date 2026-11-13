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
`tokens.json` or pulling a change to it (the dev server picks the CSS up).
`pnpm dev` in `apps/web` runs that build first (`predev`), and the test,
lint and typecheck tasks get it from turbo's `^build`.

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
| `motion`               | Durations (`instant` 80, `fast` 120, `base` 200, `slow` 320), easings (`standard`, `enter`, `exit`, and `sheet` for long travel), distances (`rise` 8, `shift` 4), scales, the stagger step and the two allowed loops                                                                                                            |

Translucent tokens (`scrim`, the state layers, the skeleton, and the dark
theme's `border` and `line`) are `rgba()` strings; everything else is
`#RRGGBB`. Base color values are owner-approved: add a role token rather than
changing one. The dark `border` and `line` are the one exception in form, not
in look: they are written as fg-based layers that paint the approved
`#34312B`/`#2B2824` on `surface` to within a few levels, so they keep the
same step on the lighter raised and overlay surfaces instead of vanishing
there.

Dark surfaces are ordered by what can stack on what: `surfaceSunken` (below
the page) < `bg` < `surface` < `surfaceOverlay` (dialogs) < `surfaceRaised`
(popovers, menus and selects, which open above dialogs).

## Scripts

- `pnpm build`: regenerates `dist/` from `tokens.json` (`scripts/build-tokens.ts`,
  using the pure generators in `scripts/generate.ts`).
- `pnpm test`: the generator tests, then `scripts/contrast-check.ts`, which
  asserts WCAG AA for every text, link, control border and focus ring on every
  opaque surface, for text on each state layer composited over the surfaces it
  sits on, and for every soft badge, plus two visibility floors: dividers
  (`line`, `border`) at 1.15:1 on surface, raised and overlay, and a hover or
  press layer at 1.08:1 over the surface it is laid on (250 pairs).
  `pnpm contrast-check` runs the check alone. The formula is in
  `scripts/wcag-contrast.ts`.
