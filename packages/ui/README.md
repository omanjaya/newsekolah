# @newsekolah/ui

Shared React 19 component library for `apps/web`, built on Radix primitives
and Tailwind v4 classes that reference `@newsekolah/ui-tokens`. Follows
DESIGN.md strictly: no gradients, radius 4/8 only (999 reserved for
`Avatar`), shadow only on floating elements (dialog, menu, popover), Inter
via the system font stack, tabular numerals in tables.

Ships as source (`exports: "./src/index.ts"`) so `apps/web` resolves and
type-checks it directly; `pnpm build` runs a declaration-only `tsc` pass so
the package can still be consumed by tooling that needs `.d.ts` files.

Import `@newsekolah/ui/styles.css` once at the app root, after
`@import "tailwindcss"`.

## Scripts

- `pnpm test`: Vitest + Testing Library + vitest-axe (Button, Form, Dialog,
  ConfirmDialog, DataTable).
- `pnpm storybook` / `pnpm build-storybook`: every component has a story;
  toggle "Tema" in the toolbar to check light and dark instead of doubling
  story files.
- `pnpm build`: `tsc --emitDeclarationOnly` for consumers that need types
  without the TypeScript source.

## Conventions

- One component per file in `src/components/`, PascalCase export matching
  the kebab-case filename.
- All user-facing default strings are Indonesian, without exclamation marks
  or emoji, and are overridable via props (see `Form`'s `translate` prop and
  `DataTable`/`ConfirmDialog` label props).
- Icons come only from `lucide-react`; domain-to-icon mapping lives in
  `src/icons.ts` so a concept never renders two different glyphs.
- `DataTable` is server-side only: the caller owns `pagination`, `sorting`,
  and `globalFilter` state and refetches on change.
