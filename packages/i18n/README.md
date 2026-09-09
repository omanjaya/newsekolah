# @newsekolah/i18n

Shared message catalogs (`messages/id.json`, `messages/en.json`, ICU
MessageFormat) plus a typed `t` helper and a runtime-agnostic date/number
formatter, used by both `apps/web` and `apps/mobile`.

- `messages/id.json` is the reference locale. `pnpm codegen` scans it and
  writes `src/message-keys.gen.ts`, a `MessageKey` union so `translate(locale,
key, values)` rejects unknown keys at compile time.
- `translate` / `createTranslator` fall back to `id` when a key is missing
  from a locale, and to the raw key when it is missing everywhere, so a
  broken translation fails loudly instead of throwing.
- `formatDate`, `formatTime`, `formatDateTime`, `formatRelative`,
  `formatNumber` wrap `Intl` with the school's timezone and locale.
  `formatRelative` follows docs/07-ui-ux.md: relative text ("2 jam lalu")
  under 24 hours, an absolute date otherwise.

Web and mobile apps wire this into next-intl / i18next respectively; this
package only owns the catalog content and the pure formatting/lookup logic.

## Scripts

- `pnpm codegen`: regenerate `src/message-keys.gen.ts` from `messages/id.json`.
- `pnpm build`: codegen, then bundle with tsup.
- `pnpm test`: codegen, then run the Vitest suite.
