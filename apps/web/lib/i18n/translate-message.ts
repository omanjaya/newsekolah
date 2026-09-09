import { translate, type Locale, type MessageKey } from "@newsekolah/i18n";

/**
 * Adapter for `@newsekolah/ui`'s `Form` `translate` prop, which is typed as
 * `(key: string) => string` so the package has no hard dependency on
 * `@newsekolah/i18n`. The cast is safe here because every message a zod
 * resolver from `@newsekolah/schemas` can produce is one of the
 * `validation.*` keys in `MessageKey`.
 */
export function translateFormMessage(locale: Locale) {
  return (key: string) => translate(locale, key as MessageKey);
}
