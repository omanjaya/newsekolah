import { translate, type Locale, type MessageKey } from "@newsekolah/i18n";
import { validationValues } from "@newsekolah/schemas";

/**
 * Adapter for `@newsekolah/ui`'s `Form` `translate` prop, which is typed as
 * `(key: string) => string` so the package has no hard dependency on
 * `@newsekolah/i18n`. The cast is safe here because every message a zod
 * resolver from `@newsekolah/schemas` can produce is one of the
 * `validation.*` keys in `MessageKey`.
 *
 * zodResolver passes on only the issue's message, so the `{min}` / `{max}`
 * a length message needs come from `validationValues`, keyed by that same
 * message, next to the limit the schema enforces.
 */
export function translateFormMessage(locale: Locale) {
  return (key: string) => translate(locale, key as MessageKey, validationValues[key]);
}
