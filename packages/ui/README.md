# @newsekolah/ui

The shared React 19 components behind every screen of `apps/web`: Radix
primitives styled with Tailwind v4 classes that resolve to the design
tokens of `@newsekolah/ui-tokens`. The look is the "Hijau Segar" direction
(warm neutral background, white surfaces, one teal-green accent); the full
rationale lives in `docs/07-ui-ux.md` section 0 and the overhaul spec,
`docs/superpowers/specs/2026-11-14-ui-overhaul-design.md`. The catalogue of
who uses what is `docs/05-shared-components.md`.

A screen builds on these components as they are. It does not assemble its
own card, label, tab strip, badge or picker; when a component is missing a
case, the component grows (see "Adding or changing a component").

## Using the package

- It ships as source (`exports: "./src/index.ts"`), so `apps/web` resolves
  and type-checks it directly. `pnpm build` runs a declaration-only `tsc`
  pass for tooling that wants `.d.ts` files.
- Import `@newsekolah/ui/styles.css` once at the app root, before the
  app's own globals. It pulls in Tailwind and
  `@newsekolah/config/tailwind/preset.css` (the token variables mapped to
  Tailwind classes), scans this package for classes, and adds the motion
  utilities, state layers, scroll fades and field and dialog helpers.
- Wrap the app in `UiLabelsProvider` (built-in strings in the reader's
  language; `apps/web/components/ui-locale-provider.tsx` maps them from the
  app catalogs) and `UiLinkProvider` (so `ListRow`, `Stat`, `TextLink`,
  `NavTabs` and `PageHeader` links use the router's `Link`).
- Fonts are the app's job: Manrope (headings, figures) and Plus Jakarta
  Sans (text), self-hosted through `next/font` in `apps/web/app/fonts.ts`;
  the preset reads them as `font-heading` and `font-sans`.

## Tokens

`packages/ui-tokens/tokens.json` is the single source. `pnpm --filter
@newsekolah/ui-tokens build` writes `dist/tokens.css` (CSS variables for
light and dark), `dist/tokens.ts` and `dist/type-roles.css`;
`pnpm --filter @newsekolah/ui-tokens test` checks every text, control,
focus and state pair against WCAG AA in both themes. Components use the
token classes only:

| Group     | Classes                                                                                           | Use                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Surface   | `bg-bg`, `bg-surface`, `bg-surface-raised`, `bg-surface-overlay`, `bg-surface-sunken`, `bg-scrim` | Page, card, popover and menu, dialog, wells and tracks, the scrim behind a dialog                             |
| Text      | `text-fg`, `text-fg-muted`                                                                        | Body and secondary text                                                                                       |
| Lines     | `border-line`, `border-border`, `border-border-strong`                                            | Rules inside lists and tables, a card's ring, a form control's border (3:1 on every surface)                  |
| Accent    | `accent`, `accent-strong`, `accent-soft`, `accent-soft-fg`, `accent-fg`                           | The main action, the active state and "now" cards only; a school's own colour overrides it at runtime         |
| Category  | `category-{green,amber,purple,blue,red}` with `-soft` and `-soft-fg`                              | Icons in soft circles, by topic, never by status                                                              |
| Semantic  | `success`, `warning`, `danger`, `info` with `-soft` and `-soft-fg`                                | Any status that is not attendance: a paid bill, an approved permit, a failed load                             |
| Status    | `status-{present,sick,excused,dispensation,absent,late}`                                          | Attendance (presensi) and nothing else                                                                        |
| State     | `bg-state-hover`, `bg-state-pressed`, `bg-state-selected`, `state-layer`, `outline-focus-ring`    | Transparent layers over transparent controls; `state-layer` paints hover and press over a control's own fill  |
| Elevation | `shadow-0` to `shadow-3` (`shadow-card` = 1, `shadow-float` = 3)                                  | 1 card, 2 popover and menu, 3 dialog and toast; dark mode has its own shadows                                 |
| Radius    | `rounded-xs` 4, `rounded-sm` 8, `rounded-md` 14, `rounded-lg` 20, `rounded-xl` 24, `rounded-full` | Small parts (checkbox, menu item, skeleton); controls; cards; bottom sheets and hero cards; pills and avatars |
| Layout    | `max-w-narrow` 720, `max-w-default` 1200, `max-w-wide` 1440                                       | Page widths, through `PageShell`                                                                              |
| Layers    | `z-sticky` < `z-overlay` < `z-modal` < `z-dropdown` < `z-popover` < `z-toast` < `z-tooltip`       | A menu opened from a dialog sits above it                                                                     |

Tailwind's palette (`text-red-500`), fixed colours (`bg-white`) and literal
colours inside arbitrary values (`bg-[#fff]`) are lint errors across the
repo.

## Type roles

One class sets size, line height, weight, tracking and family. `cn()`
knows every role, so a weight or line height written after a role
(`text-caption font-semibold`) overrides it. Literal sizes (`text-[13px]`)
are lint errors here and in `apps/web`.

| Role                 | Size / line height             | Weight | Font              | Use                                                   |
| -------------------- | ------------------------------ | ------ | ----------------- | ----------------------------------------------------- |
| `text-kiosk-display` | 56 / 60 (phone 40 / 44)        | 700    | Manrope           | A wall screen's clock and counts, read across a room  |
| `text-kiosk-title`   | 32 / 40 (phone 24 / 32)        | 700    | Manrope           | A kiosk's headings and results                        |
| `text-display`       | 28 / 32, -0.02em (phone 24/28) | 700    | Manrope           | Page title, home greeting, hero card title            |
| `text-title-lg`      | 22 / 28, -0.01em               | 700    | Manrope           | Large figures (stat tiles)                            |
| `text-title`         | 18 / 24, -0.01em               | 700    | Manrope           | Dialog and sheet titles                               |
| `text-heading`       | 16 / 22, -0.01em               | 700    | Manrope           | Section, card and empty-state titles                  |
| `text-body-lg`       | 16 / 24                        | 400    | Plus Jakarta Sans | Kiosk body text, long reading                         |
| `text-body`          | 14 / 20                        | 400    | Plus Jakarta Sans | Body text, form values, values on phone table cards   |
| `text-body-sm`       | 13 / 18                        | 400    | Plus Jakarta Sans | Secondary text, descriptions, desktop cells, eyebrows |
| `text-label`         | 13 / 18                        | 600    | Plus Jakarta Sans | Field labels, buttons, tabs, filter pills             |
| `text-caption`       | 12 / 16                        | 500    | Plus Jakarta Sans | Captions, column heads, badges                        |

Figures that count or line up use `tabular-nums`.

## Motion

Quiet and quick, CSS only (`src/styles.css`); nothing outside this list
animates.

- Durations: `duration-instant` 80 ms (press), `duration-fast` 120 ms
  (hover, focus, exit; every `transition`'s default), `duration-base`
  200 ms (small elements entering, dialogs, popovers, indicators),
  `duration-slow` 320 ms (sheets, progress, count-up). Curves:
  `ease-standard`, `ease-enter`, `ease-exit`, `ease-sheet`.
- Entering content: `animate-enter` (fade and rise 8px, staggered through
  the `--stagger` variable, 40 ms a step, six steps at most; the only
  inline style allowed for motion), `animate-fade-in` (content replacing a
  skeleton).
- Layers: `animate-overlay-*`, `animate-dialog-*` (scale from 0.97),
  `animate-sheet-*`, `animate-drawer-*`, `animate-popover-*` (4px from the
  anchor side), `animate-rise-in`; a closing layer lets clicks through.
- Feedback and state: `motion-press` (0.98 on press for buttons and
  clickable cards, never text links or table rows), `motion-indicator`
  (tab pills, switch thumbs, chevrons), `motion-meter` (progress widths),
  `motion-layout` and `motion-collapse` (sidebar width, navigation groups),
  `skeleton` (1.5 s shimmer), `animate-live` (the 2 s "in progress" dot),
  and the `useCountUp` hook for stat figures on first load.
- Rules: only opacity, transform and colour animate (the two layout cases
  aside); nothing runs longer than 320 ms, bounces or loops except the
  skeleton, spinners and the live dot; nothing delays interaction. Under
  `prefers-reduced-motion: reduce` transforms, slides and count-up stop,
  leaving short fades.

## Component families

- **Page frame**: `PageShell` (variants default, fit, narrow, wide),
  `PageHeader` (eyebrow, title, description, `leading` avatar or icon,
  actions; on a phone secondary actions fold into a menu on the title
  line), `Breadcrumb`, `NavTabs`, `StickySaveBar`, `StatePage` (404, error,
  no access, module off, offline).
- **Surfaces and content**: `Card` (`CardHeader`, `CardTitle`,
  `CardDescription`, `CardContent`, `CardFooter`; tones, padding,
  `interactive`), `HeroCard`, `SectionHeader`, `List` and `ListRow`
  (`titleLines` for long titles, `keepMetaWhole` so every fact, a date or
  a time, keeps its width and a trailing badge out of room moves under
  the text, whole), `DataList`, `Stat`/`StatGrid` (a
  `selected` state for tiles that filter a list; a `strip` shares its row
  equally and pairs on a phone up to four figures, eight without icons),
  `StatTile`, `IconCircle`,
  `Avatar`, `AvatarGroup`, `Badge`, `CountBadge`, `StatusBadge` (attendance)
  and `SemanticStatusBadge`, `Progress` (meter with threshold `markers`),
  `Stepper`, `Disclosure`, `Alert` (one or two actions), `EmptyState`,
  `FirstUseEmptyState`, `FilteredEmptyState`, `Skeleton` and its presets,
  `TextLink`, `Kbd`, `QrPanel`, `SafeHtml`.
- **Forms**: `Field` (label, hint, error, required; vertical, horizontal or
  inline; a render prop for composite controls), `FormSection`,
  `FormActions`, `FormError`, `Form` for react-hook-form, `Input`,
  `PasswordInput`, `SearchInput`, `Textarea`, `Select`, `Combobox`
  (server-side search, or local filtering when no search handler is
  given), `Checkbox` (with `label`), `Switch`, `RadioGroup` (default or
  card), `SegmentedControl` (sizes sm, md and dense; `fullWidth` or
  `fullWidth="phone"`), `NumberInput`, `DatePicker`, `DateRangePicker`,
  `MonthPicker`, `TimePicker`, `DateTimeField`, `Calendar`, `FileDropzone`.
- **Data**: `DataTable` (local, server or cursor paging, filter pills of
  type select, boolean, dateRange and month, error and retry, cards on a
  phone), `Table` (`framed={false}` inside a Card of its own),
  `RowActionsMenu`.
- **Overlays and navigation**: `Dialog` (a bottom sheet under 640px, sizes,
  sticky footer), `Sheet` (bottom or right), `ConfirmDialog`, `Popover`,
  `DropdownMenu`, `Tooltip`, `Tabs` (pill or underline, counts),
  `CommandPalette`, `Toaster` and `toast`.
- **Scanning and kiosks**: `Scanner` (`action` in a page, `kiosk` on a
  station, `fullScreen={false}` inside a kiosk frame; `lead` for a field
  filled in before scanning, between the header and the camera), `BarcodeScannerField`,
  `ScannerResultBanner`, and the scanner hooks.
- **Hooks**: `useCountUp`, `useMediaQuery`, `useContainerMinWidth`, `useHydrated`, `useScrollEdges`,
  `useActiveIndicator`, `useCollapsingTitle`, `useScanFeedback`,
  `useCameraScanner`, `useBarcodeScanner`, `useDebouncedCallback`,
  `useFieldControl`.

## Conventions

- Change handlers follow one rule. A control that stands in for a native
  input (`DatePicker`, `DateRangePicker`, `MonthPicker`, `TimePicker`,
  `DateTimeField`, `NumberInput`, `Calendar`) calls `onChange(value)` with
  the value itself, never an event, so a react-hook-form `{...field}`
  spreads onto it. A choice control on a Radix root (`Select`, `Combobox`,
  `RadioGroup`, `SegmentedControl`) calls `onValueChange(value)`; wire it
  with `onValueChange={field.onChange}`.
- Every control reads the surrounding `Field` through `useFieldControl`
  (id, `aria-describedby`, invalid, required, disabled), so a screen never
  writes a `<label>` or wires ids by hand.
- Touch targets are 44px wherever the pointer is coarse or the screen is
  narrower than `md`, without moving the layout.
- Icons come only from `lucide-react`; the domain-to-icon map in
  `src/icons.ts` keeps one glyph per concept.

## Adding or changing a component

1. Look for the family first. A missing case is usually a prop on an
   existing component (a size, a slot, a state), not a new component.
2. One component per file in `src/components/`, kebab-case file and
   PascalCase export; export it and its prop types from `src/index.ts`.
   Files stay under 400 lines; split parts into siblings.
3. Public APIs stay backward compatible: new props are optional with the
   old behaviour as default; a retired prop keeps working until its
   removal date is written next to it.
4. Tokens, type roles and the motion vocabulary only; no literal sizes,
   colours or durations; no emoji anywhere.
5. No user-facing string is written into a component. Add a field to
   `UiLabels` with its Indonesian default (sentence case, "dan" rather
   than "&"), map it in `apps/web/components/ui-locale-provider.tsx` from
   keys in both app catalogs (Indonesian and English), and let a prop
   override it where a screen needs its own words.
6. Accessible by construction: real buttons, labelled controls, keyboard
   operation matching the WAI-ARIA pattern, visible focus, announced
   status.
7. Ship a story (light, dark through the "Tema" toolbar or
   `globals: { theme: "dark" }`, and a phone width through `phoneViewport`)
   and tests for the behaviour and for axe (`expectNoAxeViolations`).
8. Run `pnpm --filter @newsekolah/ui typecheck`, `lint` and `test`.

## Lint guard rails

`packages/config/eslint` holds the rules. Repo-wide: palette and fixed
colours, literal colours in arbitrary values, emoji. Here: literal font
sizes. In `apps/web`, the `design-system` plugin
(`@newsekolah/config/eslint/design-system`) adds `no-literal-font-size`,
`no-panel-radius` (a bordered box on `rounded-sm`/`rounded-xs`),
`no-native-pickers` (date, time, month and number inputs) and the ban on
`window.confirm`, `alert` and `prompt` everywhere, plus `no-raw-elements`
(headings, `button`, `select`, `textarea`, `table`, `label`) in routes and
features. A rare composite widget that must keep a raw element says why in
an `eslint-disable-next-line` comment.

## Scripts

- `pnpm test`: Vitest, Testing Library and vitest-axe.
- `pnpm storybook` / `pnpm build-storybook`: every component has stories;
  "Foundations" shows tokens, type roles and motion.
- `pnpm build`: declarations only.
- `pnpm typecheck`, `pnpm lint`.
